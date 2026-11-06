import { Inject, Injectable, Optional } from "@nestjs/common";
import { promisify } from "node:util";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { OtpService, normalizePhone } from "./otp.service";
import { AuthenticationError, SessionService } from "./session.service";
import { PrismaService } from "../prisma/prisma.service";

const scrypt = promisify(scryptCallback);

export interface AuthResult {
  user: {
    id: string;
    email?: string | null;
    phone?: string | null;
    roles: string[];
  };
  session: Awaited<ReturnType<SessionService["create"]>>;
}

interface AuthUserRecord {
  id: string;
  email?: string | null;
  phone?: string | null;
  passwordHash?: string | null;
  status: string;
  roles?: Array<string | { name?: string; role?: { name?: string } | null }>;
  territoryAssignments?: Array<{ territoryId: string }>;
  territoryIds?: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(OtpService) otpService?: OtpService,
    @Optional() @Inject(SessionService) sessionService?: SessionService,
  ) {
    this.otpService = otpService ?? new OtpService();
    this.sessionService = sessionService ?? new SessionService();
  }

  private readonly otpService: OtpService;
  private readonly sessionService: SessionService;

  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = (await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        roles: { include: { role: true } },
        territoryAssignments: { select: { territoryId: true } },
      },
    })) as AuthUserRecord | null;
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !user.passwordHash ||
      !(await AuthService.verifyPassword(password, user.passwordHash))
    ) {
      throw new AuthenticationError("Invalid email or password");
    }
    return this.issueSession(user);
  }

  async requestOtp(phone: string): Promise<{ expiresAt: Date }> {
    return this.otpService.request(normalizePhone(phone));
  }

  async verifyOtp(phone: string, code: string): Promise<AuthResult> {
    const normalizedPhone = normalizePhone(phone);
    await this.otpService.verify(normalizedPhone, code);
    const user = (await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
      include: {
        roles: { include: { role: true } },
        territoryAssignments: { select: { territoryId: true } },
      },
    })) as AuthUserRecord | null;
    if (!user || user.status !== "ACTIVE") {
      throw new AuthenticationError("Invalid phone or OTP");
    }
    return this.issueSession(user);
  }

  async revokeSession(tokenOrId: string): Promise<void> {
    await this.sessionService.revokeSession(tokenOrId);
  }

  async validateSession(token: string) {
    return this.sessionService.validate(token);
  }

  private async issueSession(user: AuthUserRecord): Promise<AuthResult> {
    const roles = (user.roles ?? [])
      .map((entry) =>
        typeof entry === "string" ? entry : (entry.role?.name ?? entry.name),
      )
      .filter((role): role is string => Boolean(role));
    const territoryIds =
      user.territoryAssignments?.map(({ territoryId }) => territoryId) ??
      user.territoryIds ??
      [];
    const session = await this.sessionService.create(
      user.id,
      roles,
      territoryIds,
    );
    return {
      user: { id: user.id, email: user.email, phone: user.phone, roles },
      session,
    };
  }

  static async hashPassword(password: string): Promise<string> {
    if (password.length < 8)
      throw new Error("Password must be at least 8 characters");
    const salt = randomBytes(16).toString("hex");
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt$${salt}$${derived.toString("hex")}`;
  }

  static async verifyPassword(
    password: string,
    encoded: string,
  ): Promise<boolean> {
    const [, salt, expectedHex] = encoded.split("$");
    if (!salt || !expectedHex) return false;
    try {
      const expected = Buffer.from(expectedHex, "hex");
      const actual = (await scrypt(password, salt, expected.length)) as Buffer;
      return (
        expected.length === actual.length && timingSafeEqual(expected, actual)
      );
    } catch {
      return false;
    }
  }
}
