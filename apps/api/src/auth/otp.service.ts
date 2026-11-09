import { Injectable } from "@nestjs/common";
import {
  createHash,
  randomInt,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { WhatsAppOtpSender } from "../notifications/channel.adapter";

export type WhatsAppProvider = WhatsAppOtpSender;

/** Adapter boundary for WhatsApp Cloud API/Twilio/etc.; no vendor is required in the MVP tests. */
export class NoopWhatsAppProvider implements WhatsAppProvider {
  async sendOtp(
    _phone: string,
    _code: string,
    _expiresAt: Date,
  ): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "WhatsApp OTP provider is not configured; set a production adapter before accepting OTP sign-in",
      );
    }
    return undefined;
  }
}

export interface OtpOptions {
  provider?: WhatsAppProvider;
  codeTtlMs?: number;
  maxRequests?: number;
  windowMs?: number;
  maxAttempts?: number;
}

export class OtpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OtpError";
  }
}

interface RequestRecord {
  requestedAt: number[];
  challenge?: Challenge;
}

interface Challenge {
  salt: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
}

@Injectable()
export class OtpService {
  private readonly prisma?: PrismaService;
  private readonly provider: WhatsAppProvider;
  private readonly codeTtlMs: number;
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxAttempts: number;
  private readonly records = new Map<string, RequestRecord>();
  private readonly verifyLocks = new Map<string, Promise<void>>();

  constructor(
    prismaOrOptions: PrismaService | OtpOptions = {},
    options: OtpOptions = {},
  ) {
    const configured = isPrismaService(prismaOrOptions)
      ? options
      : prismaOrOptions;
    if (isPrismaService(prismaOrOptions)) this.prisma = prismaOrOptions;
    this.provider = configured.provider ?? new NoopWhatsAppProvider();
    this.codeTtlMs = configured.codeTtlMs ?? 5 * 60_000;
    this.maxRequests = configured.maxRequests ?? 3;
    this.windowMs = configured.windowMs ?? 15 * 60_000;
    this.maxAttempts = configured.maxAttempts ?? 5;
  }

  async request(phone: string): Promise<{ expiresAt: Date }> {
    const normalizedPhone = normalizePhone(phone);
    const now = Date.now();
    const record = this.records.get(normalizedPhone) ?? { requestedAt: [] };
    record.requestedAt = record.requestedAt.filter(
      (time) => now - time < this.windowMs,
    );
    const requestCount = this.prisma
      ? await this.prisma.otpChallenge.count({
          where: {
            phone: normalizedPhone,
            requestedAt: { gte: new Date(now - this.windowMs) },
          },
        })
      : record.requestedAt.length;
    if (requestCount >= this.maxRequests)
      throw new OtpError("Too many OTP requests", 429);

    const code = randomInt(100000, 1000000).toString();
    const salt = randomBytes(16).toString("hex");
    const expiresAt = new Date(now + this.codeTtlMs);
    record.requestedAt.push(now);
    record.challenge = {
      salt,
      codeHash: this.hash(code, salt),
      expiresAt,
      attempts: 0,
      maxAttempts: this.maxAttempts,
    };
    const challengeId = randomUUID();
    if (this.prisma) {
      await this.prisma.otpChallenge.create({
        data: {
          id: challengeId,
          phone: normalizedPhone,
          salt: record.challenge.salt,
          codeHash: record.challenge.codeHash,
          expiresAt,
          maxAttempts: this.maxAttempts,
        },
      });
    }
    try {
      await this.provider.sendOtp(normalizedPhone, code, expiresAt);
    } catch (error) {
      if (this.prisma?.otpChallenge.delete) {
        await this.prisma.otpChallenge.delete({ where: { id: challengeId } });
      }
      throw error;
    }
    if (!this.prisma) this.records.set(normalizedPhone, record);
    return { expiresAt };
  }

  async requestOtp(phone: string): Promise<{ expiresAt: Date }> {
    return this.request(phone);
  }

  async verify(phone: string, code: string): Promise<boolean> {
    const normalizedPhone = normalizePhone(phone);
    const previous = this.verifyLocks.get(normalizedPhone) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => lock);
    this.verifyLocks.set(normalizedPhone, queued);
    await previous;
    try {
      return await this.verifyLocked(normalizedPhone, code);
    } finally {
      release();
      if (this.verifyLocks.get(normalizedPhone) === queued) this.verifyLocks.delete(normalizedPhone);
    }
  }

  private async verifyLocked(normalizedPhone: string, code: string): Promise<boolean> {
    const record = this.records.get(normalizedPhone);
    const challenge = this.prisma
      ? await this.prisma.otpChallenge.findFirst({
          where: { phone: normalizedPhone, consumedAt: null },
          orderBy: { requestedAt: "desc" },
        })
      : record?.challenge;
    if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
      throw new OtpError("OTP is invalid or expired", 401);
    }
    const expected = Buffer.from(challenge.codeHash, "hex");
    const actual = Buffer.from(this.hash(code, challenge.salt), "hex");
    const valid =
      expected.length === actual.length && timingSafeEqual(expected, actual);
    const attempts = challenge.attempts + 1;
    if (this.prisma) {
      if (!("id" in challenge) || typeof challenge.id !== "string") {
        throw new OtpError("OTP is invalid or expired", 401);
      }
      const update = this.prisma.otpChallenge.updateMany;
      if (update) {
        const result = await update({
          where: {
            id: challenge.id,
            consumedAt: null,
            expiresAt: { gt: new Date() },
            attempts: { lt: challenge.maxAttempts },
          },
          data: {
            attempts: { increment: 1 },
            ...(valid || attempts >= challenge.maxAttempts ? { consumedAt: new Date() } : {}),
          },
        });
        if (result.count !== 1) throw new OtpError("OTP is invalid or expired", 401);
      } else {
        await this.prisma.otpChallenge.update({
          where: { id: challenge.id },
          data: {
            attempts,
            ...(valid || attempts >= challenge.maxAttempts ? { consumedAt: new Date() } : {}),
          },
        });
      }
    } else if (!valid && attempts >= challenge.maxAttempts) {
      record!.challenge = undefined;
    }
    if (!valid) {
      throw new OtpError("OTP is invalid or expired", 401);
    }
    if (!this.prisma) record!.challenge = undefined;
    return true;
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    return this.verify(phone, code);
  }

  private hash(code: string, salt: string): string {
    return createHash("sha256").update(`${salt}:${code}`).digest("hex");
  }
}

function isPrismaService(
  value: PrismaService | OtpOptions,
): value is PrismaService {
  return "otpChallenge" in value;
}

export function normalizePhone(phone: string): string {
  const normalized = phone.trim().replace(/[\s()-]/g, "");
  if (!/^\+?[1-9]\d{7,14}$/.test(normalized)) {
    throw new OtpError("A valid phone number is required", 400);
  }
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}
