import { Injectable } from "@nestjs/common";
import {
  createHash,
  randomInt,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export interface WhatsAppProvider {
  sendOtp(phone: string, code: string, expiresAt: Date): Promise<void>;
}

/** Adapter boundary for WhatsApp Cloud API/Twilio/etc.; no vendor is required in the MVP tests. */
export class NoopWhatsAppProvider implements WhatsAppProvider {
  async sendOtp(
    _phone: string,
    _code: string,
    _expiresAt: Date,
  ): Promise<void> {
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
  private readonly provider: WhatsAppProvider;
  private readonly codeTtlMs: number;
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxAttempts: number;
  private readonly records = new Map<string, RequestRecord>();

  constructor(options: OtpOptions = {}) {
    this.provider = options.provider ?? new NoopWhatsAppProvider();
    this.codeTtlMs = options.codeTtlMs ?? 5 * 60_000;
    this.maxRequests = options.maxRequests ?? 3;
    this.windowMs = options.windowMs ?? 15 * 60_000;
    this.maxAttempts = options.maxAttempts ?? 5;
  }

  async request(phone: string): Promise<{ expiresAt: Date }> {
    const normalizedPhone = normalizePhone(phone);
    const now = Date.now();
    const record = this.records.get(normalizedPhone) ?? { requestedAt: [] };
    record.requestedAt = record.requestedAt.filter(
      (time) => now - time < this.windowMs,
    );
    if (record.requestedAt.length >= this.maxRequests) {
      throw new OtpError("Too many OTP requests", 429);
    }

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
    this.records.set(normalizedPhone, record);
    await this.provider.sendOtp(normalizedPhone, code, expiresAt);
    return { expiresAt };
  }

  async requestOtp(phone: string): Promise<{ expiresAt: Date }> {
    return this.request(phone);
  }

  async verify(phone: string, code: string): Promise<boolean> {
    const record = this.records.get(normalizePhone(phone));
    const challenge = record?.challenge;
    if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
      throw new OtpError("OTP is invalid or expired", 401);
    }
    challenge.attempts += 1;
    const expected = Buffer.from(challenge.codeHash, "hex");
    const actual = Buffer.from(this.hash(code, challenge.salt), "hex");
    const valid =
      expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!valid && challenge.attempts >= challenge.maxAttempts) {
      record!.challenge = undefined;
    }
    if (!valid) {
      throw new OtpError("OTP is invalid or expired", 401);
    }
    record!.challenge = undefined;
    return true;
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    return this.verify(phone, code);
  }

  private hash(code: string, salt: string): string {
    return createHash("sha256").update(`${salt}:${code}`).digest("hex");
  }
}

export function normalizePhone(phone: string): string {
  const normalized = phone.trim().replace(/[\s()-]/g, "");
  if (!/^\+?[1-9]\d{7,14}$/.test(normalized)) {
    throw new OtpError("A valid phone number is required", 400);
  }
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}
