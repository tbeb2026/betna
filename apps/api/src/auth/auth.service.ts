import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";
import { promisify } from "node:util";
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { OtpService, normalizePhone } from "./otp.service";
import { AuthenticationError, SessionService } from "./session.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationService } from "../notifications/notifications.service";

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

interface EmailChallenge {
  salt: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  confirmedAt?: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(OtpService) otpService?: OtpService,
    @Optional() @Inject(SessionService) sessionService?: SessionService,
    @Optional() @Inject(NotificationService)
    private readonly notifications?: NotificationService,
  ) {
    this.otpService = otpService ?? new OtpService();
    this.sessionService = sessionService ?? new SessionService();
  }

  private readonly otpService: OtpService;
  private readonly sessionService: SessionService;
  private readonly emailChallenges = new Map<string, EmailChallenge>();
  private readonly emailRequestTimes = new Map<string, number[]>();
  private readonly emailVerifyLocks = new Map<string, Promise<void>>();

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
    return this.requestOwnerPhoneOtp(phone);
  }

  async requestOwnerPhoneOtp(phone: string): Promise<{ expiresAt: Date }> {
    return this.otpService.request(normalizePhone(phone));
  }

  async requestOwnerEmailVerification(emailInput: string): Promise<{ expiresAt: Date }> {
    const email = this.normalizeEmail(emailInput);
    const now = Date.now();
    const store = (this.prisma as any).emailVerificationChallenge;
    const windowMs = 15 * 60_000;
    const maxRequests = 3;
    const requestTimes = (this.emailRequestTimes.get(email) ?? []).filter(
      (requestedAt) => now - requestedAt < windowMs,
    );
    const recentRequests = store?.count
      ? await store.count({ where: { email, requestedAt: { gte: new Date(now - windowMs) } } })
      : requestTimes.length;
    if (recentRequests >= maxRequests) {
      throw new HttpException("Too many email verification requests", HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = randomInt(100000, 1000000).toString();
    const salt = randomBytes(16).toString("hex");
    const expiresAt = new Date(now + 10 * 60_000);
    const challenge: EmailChallenge = {
      salt,
      codeHash: this.hashChallenge(code, salt),
      expiresAt,
      attempts: 0,
      maxAttempts: 5,
    };
    if (!this.notifications) {
      throw new Error("Email notification provider is not configured");
    }
    const deliveries = await this.notifications.enqueue({
      type: "OWNER_EMAIL_VERIFICATION",
      recipients: [{ email }],
      channels: ["EMAIL"],
      subject: "Verify your Betna owner account",
      body: `Your Betna owner verification code is ${code}. It expires in 10 minutes.`,
      payload: { email, expiresAt: expiresAt.toISOString() },
      idempotencyKey: `owner-email-verification:${email}:${expiresAt.getTime()}`,
    });
    if (
      Array.isArray(deliveries) &&
      deliveries.some((delivery) =>
        delivery?.status && !["SENT", "QUEUED"].includes(delivery.status),
      )
    ) {
      throw new Error("Email verification could not be delivered");
    }
    requestTimes.push(now);
    this.emailRequestTimes.set(email, requestTimes);
    if (store?.create) {
      await store.create({
        data: {
          id: randomUUID(),
          email,
          salt,
          codeHash: challenge.codeHash,
          expiresAt,
          maxAttempts: challenge.maxAttempts,
        },
      });
    } else {
      this.emailChallenges.set(email, challenge);
    }
    return { expiresAt };
  }

  async confirmOwnerEmailVerification(emailInput: string, code: string): Promise<{ verified: true }> {
    const email = this.normalizeEmail(emailInput);
    const previous = this.emailVerifyLocks.get(email) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => lock);
    this.emailVerifyLocks.set(email, queued);
    await previous;
    try {
      return await this.confirmOwnerEmailVerificationLocked(email, code);
    } finally {
      release();
      if (this.emailVerifyLocks.get(email) === queued) this.emailVerifyLocks.delete(email);
    }
  }

  private async confirmOwnerEmailVerificationLocked(email: string, code: string): Promise<{ verified: true }> {
    const store = (this.prisma as any).emailVerificationChallenge;
    const challenge = store?.findFirst
      ? await store.findFirst({ where: { email, consumedAt: null }, orderBy: { requestedAt: "desc" } })
      : this.emailChallenges.get(email);
    if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Email verification code is invalid or expired");
    }
    const expected = Buffer.from(challenge.codeHash, "hex");
    const actual = Buffer.from(this.hashChallenge(code, challenge.salt), "hex");
    const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
    const attempts = challenge.attempts + 1;
    if (store?.updateMany && challenge.id) {
      const result = await store.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
          attempts: { lt: challenge.maxAttempts },
        },
        data: {
          attempts: { increment: 1 },
          ...(valid
            ? { confirmedAt: new Date(), consumedAt: new Date() }
            : attempts >= challenge.maxAttempts
              ? { consumedAt: new Date() }
              : {}),
        },
      });
      if (result.count !== 1) throw new BadRequestException("Email verification code is invalid or expired");
    } else if (store?.update && challenge.id) {
      await store.update({
        where: { id: challenge.id },
        data: {
          attempts,
          ...(valid
            ? { confirmedAt: new Date(), consumedAt: new Date() }
            : attempts >= challenge.maxAttempts
              ? { consumedAt: new Date() }
              : {}),
        },
      });
    } else {
      challenge.attempts = attempts;
      if (valid) challenge.confirmedAt = new Date();
      if (!valid && attempts >= challenge.maxAttempts) this.emailChallenges.delete(email);
    }
    if (!valid) throw new BadRequestException("Email verification code is invalid or expired");
    return { verified: true };
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

  async onboardOwner(input: {
    email: string;
    password: string;
    phone: string;
    firstName: string;
    lastName: string;
    otpCode: string;
    emailVerificationCode?: string;
    emailCode?: string;
    authorizationAttested: boolean;
  }): Promise<AuthResult> {
    if (!input.authorizationAttested) {
      throw new BadRequestException("Owner authorization attestation is required");
    }
    const email = this.normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    if (!input.firstName.trim() || !input.lastName.trim()) {
      throw new Error("First and last name are required");
    }
    await this.otpService.verify(phone, input.otpCode);
    if (input.emailVerificationCode || input.emailCode) {
      await this.confirmOwnerEmailVerification(
        email,
        input.emailVerificationCode ?? input.emailCode ?? "",
      );
    }
    if (!(await this.isEmailVerified(email))) {
      throw new BadRequestException("Email verification is required before activation");
    }
    const existing = await this.prisma.user.findFirst?.({
      where: { OR: [{ email }, { phone }] },
    });
    if (existing) throw new Error("An account already exists for this email or phone");
    const role = await this.prisma.role.findUnique({ where: { name: "OWNER" } });
    if (!role) throw new BadRequestException("Owner onboarding is not configured");
    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        passwordHash: await AuthService.hashPassword(input.password),
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        status: "ACTIVE",
        emailVerified: true,
        phoneVerified: true,
        authorizationAttested: true,
        roles: { create: { roleId: role.id } },
      },
      include: { roles: { include: { role: true } }, territoryAssignments: { select: { territoryId: true } } },
    });
    return this.issueSession(user as AuthUserRecord);
  }

  private async isEmailVerified(email: string): Promise<boolean> {
    const challengeStore = (this.prisma as any).emailVerificationChallenge;
    if (challengeStore?.findFirst) {
      const confirmed = await challengeStore.findFirst({
        where: { email, confirmedAt: { not: null } },
        orderBy: { confirmedAt: "desc" },
      });
      return Boolean(confirmed);
    }
    return Boolean(this.emailChallenges.get(email)?.confirmedAt);
  }

  private normalizeEmail(email: string): string {
    const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      throw new BadRequestException("A valid email is required");
    }
    return normalized;
  }

  private hashChallenge(code: string, salt: string): string {
    return createHash("sha256").update(`${salt}:${code}`).digest("hex");
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
