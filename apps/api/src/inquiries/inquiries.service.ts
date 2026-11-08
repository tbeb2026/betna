import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { GuestInquiryInput } from "@betna/contracts";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationEvent, NotificationService } from "../notifications/notifications.service";
import { InquiryActor, LocationReleaseService } from "./location-release.service";
import { AvailabilityService } from "../availability/availability.service";

export type GuestInquiryRequest = GuestInquiryInput & {
  honeypot?: string;
  fingerprint?: string;
};

export type OwnerResponse = {
  decision: "CONFIRMED" | "DECLINED";
  message?: string;
};

const recentGuestSubmissions = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS = 5;
const MAX_RATE_KEYS = 10_000;

@Injectable()
export class InquiriesService {
  private readonly locationRelease: LocationReleaseService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    @Optional() audit?: AuditService,
    @Optional() @Inject(LocationReleaseService) locationRelease?: LocationReleaseService,
    @Optional() @Inject(AvailabilityService) private readonly availability?: AvailabilityService,
  ) {
    this.audit = audit;
    this.locationRelease = locationRelease ?? new LocationReleaseService(prisma, audit);
  }

  private readonly audit?: AuditService;

  async createGuestInquiry(input: GuestInquiryRequest) {
    this.validateGuestInput(input);
    const property = await (this.prisma as any).property.findUnique({
      where: { id: input.propertyId },
      include: { owner: true, offerings: true },
    });
    if (!property || (property.status && property.status !== "PUBLISHED")) {
      throw new NotFoundException("Published property not found");
    }
    const offering = this.resolveOffering(property.offerings, input);
    const inquiry = await this.withTransaction(async (tx: any) => {
      await this.assertRateLimit(input, tx);
      return tx.inquiry.create({
        data: {
          reference: this.reference(), propertyId: input.propertyId,
          offeringId: input.offeringId ?? offering?.id, status: "NEW",
          guestName: input.name.trim(), guestEmail: input.email.trim().toLowerCase(),
          guestPhone: input.phone.trim(), message: input.message.trim(),
          startDate: this.optionalDate(input.startDate, "startDate"),
          endDate: this.optionalDate(input.endDate, "endDate"), guests: input.guests,
        },
      });
    });

    const owner = property.owner ?? (property.ownerId ? await this.findUser(property.ownerId) : null);
    const staff = await this.findStaffRecipients();
    const recipients = [
      ...(owner ? [{ userId: owner.id, email: owner.email, phone: owner.phone }] : []),
      ...staff,
      { email: inquiry.guestEmail, phone: inquiry.guestPhone },
    ];
    const event: NotificationEvent = {
      type: "INQUIRY_CREATED",
      inquiryId: inquiry.id,
      reference: inquiry.reference,
      recipients,
      subject: `New Betna inquiry ${inquiry.reference}`,
      body: `Betna received inquiry ${inquiry.reference}. We review inquiries during business hours; urgent cases may be handled by staff outside those hours.`,
      idempotencyKey: `inquiry-created:${inquiry.id}`,
      payload: { propertyId: property.id, status: inquiry.status },
    };
    await this.notifications.enqueue(event);

    return {
      inquiry: this.publicInquiry(inquiry),
      location: this.publicLocation(property),
      reviewExpectation:
        "Betna reviews inquiries during configured business hours. Urgent cases may be handled by staff outside those hours.",
    };
  }

  async ownerRespond(inquiryId: string, ownerId: string, response: OwnerResponse | "CONFIRMED" | "DECLINED") {
    const decision = typeof response === "string" ? response : response?.decision;
    if (decision !== "CONFIRMED" && decision !== "DECLINED") {
      throw new BadRequestException("Owner decision must be CONFIRMED or DECLINED");
    }
    const inquiry = await this.findInquiry(inquiryId);
    if (inquiry.property?.ownerId !== ownerId && inquiry.property?.owner?.id !== ownerId) {
      throw new ForbiddenException("Only the property owner can respond");
    }
    if (!["NEW", "CONTACTED", "LOCATION_APPROVED"].includes(inquiry.status)) {
      throw new ConflictException("Inquiry has already been decided");
    }
    if (decision === "CONFIRMED" && this.availability && (inquiry.offering?.mode === "SHORT_STAY" || inquiry.startDate || inquiry.endDate)) {
      const blocked = await this.availability.confirmInquiryAndBlockDates(inquiryId, ownerId);
      await this.notifications.enqueue({
        type: "INQUIRY_OWNER_CONFIRMED",
        idempotencyKey: `inquiry-owner:${inquiryId}:CONFIRMED`,
        inquiryId,
        reference: inquiry.reference,
        recipients: [{ email: inquiry.guestEmail, phone: inquiry.guestPhone }],
        body: `The owner has confirmed inquiry ${inquiry.reference}.`,
        payload: { status: "OWNER_CONFIRMED" },
      });
      return this.publicInquiry(blocked.inquiry);
    }
    const status = decision === "CONFIRMED" ? "OWNER_CONFIRMED" : "OWNER_DECLINED";
    const updated = await (this.prisma as any).inquiry.update({
      where: { id: inquiryId },
      data: { status },
      include: { property: true },
    });
    await this.audit?.record({ id: ownerId }, `INQUIRY_OWNER_${decision}`, {
      type: "Inquiry",
      id: inquiryId,
    });
    await this.notifications.enqueue({
      type: `INQUIRY_OWNER_${decision}`,
      idempotencyKey: `inquiry-owner:${inquiryId}:${decision}`,
      inquiryId,
      reference: inquiry.reference,
      recipients: [{ email: inquiry.guestEmail, phone: inquiry.guestPhone }],
      body: `The owner has ${decision === "CONFIRMED" ? "confirmed" : "declined"} inquiry ${inquiry.reference}.`,
      payload: { status },
    });
    return this.publicInquiry(updated);
  }

  async adminReleaseLocation(inquiryId: string, actor: InquiryActor, reason?: string) {
    const released = await this.locationRelease.release(inquiryId, actor, reason);
    // Re-enqueue even for an idempotent release. If a provider or process died
    // after the DB commit, the persisted notification row can then be claimed
    // and completed without creating a duplicate message.
    await this.notifications.enqueue({
      type: "INQUIRY_LOCATION_APPROVED",
      idempotencyKey: `inquiry-location-approved:${inquiryId}:${released.releaseId}`,
      inquiryId,
      reference: released.inquiry.reference,
      recipients: [{ email: released.inquiry.guestEmail, phone: released.inquiry.guestPhone }],
      body: `Betna approved the protected location for inquiry ${released.inquiry.reference}.`,
      payload: { status: released.inquiry.status },
    });
    return released;
  }

  async revokeLocation(inquiryId: string, actor: InquiryActor, reason?: string) {
    return this.locationRelease.revoke(inquiryId, actor, reason);
  }

  async getReleasedLocation(inquiryId: string, actor: InquiryActor) {
    return this.locationRelease.getReleasedLocation(inquiryId, actor);
  }

  async listForOwner(ownerId: string) {
    return (this.prisma as any).inquiry.findMany({
      where: { property: { ownerId } },
      include: { property: true, offering: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async listForAdmin() {
    return (this.prisma as any).inquiry.findMany({
      include: { property: true, offering: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async logContactClick(input: { propertyId: string; target: "BETNA" | "OWNER"; channel: "WHATSAPP" | "EMAIL" }) {
    if (!input || typeof input !== "object" || typeof input.propertyId !== "string" || !input.propertyId.trim() || input.propertyId.length > 100 || typeof input.target !== "string" || typeof input.channel !== "string" || !["BETNA", "OWNER"].includes(input.target) || !["WHATSAPP", "EMAIL"].includes(input.channel) || (input.target === "OWNER" && input.channel !== "WHATSAPP")) {
      throw new BadRequestException("Invalid contact click");
    }
    const property = await (this.prisma as any).property.findUnique?.({
      where: { id: input.propertyId },
      include: { owner: true },
    });
    if (!property || property.status !== "PUBLISHED") throw new NotFoundException("Published property not found");
    if (input.target === "OWNER" && !property.owner?.phone) throw new BadRequestException("Published owner contact is unavailable");
    const data = {
      propertyId: input.propertyId,
      target: input.target,
      channel: input.channel,
    };
    const store = (this.prisma as any).contactClick;
    if (!store?.create) return data;
    return (await store.create({ data })) ?? data;
  }

  private async findInquiry(id: string) {
    const inquiry = await (this.prisma as any).inquiry.findUnique({
      where: { id },
      include: { property: { include: { owner: true } }, offering: true },
    });
    if (!inquiry) throw new NotFoundException("Inquiry not found");
    return inquiry;
  }

  private async findUser(id: string) {
    return (this.prisma as any).user?.findUnique?.({ where: { id } });
  }

  private async findStaffRecipients() {
    const rows = await (this.prisma as any).user?.findMany?.({
      where: { status: "ACTIVE", roles: { some: { role: { name: "ADMIN" } } } },
      select: { id: true, email: true, phone: true },
    });
    if (Array.isArray(rows) && rows.length) return rows;
    return [{ email: process.env.BETNA_INQUIRY_EMAIL ?? "inquiries@betna.example", phone: process.env.BETNA_INQUIRY_PHONE }];
  }

  private validateGuestInput(input: GuestInquiryRequest) {
    if (!input || typeof input !== "object") throw new BadRequestException("Inquiry payload is required");
    if (input.honeypot !== undefined && typeof input.honeypot !== "string") throw new BadRequestException("Inquiry payload is invalid");
    if (typeof input.honeypot === "string" && input.honeypot.trim()) throw new BadRequestException("Inquiry could not be submitted");
    if (typeof input.propertyId !== "string" || typeof input.name !== "string" || typeof input.message !== "string" || !input.propertyId.trim() || !input.name.trim() || !input.message.trim()) throw new BadRequestException("Name, message and property are required");
    if (input.name.trim().length > 160 || input.message.trim().length > 4000) throw new BadRequestException("Name or message is too long");
    if (typeof input.email !== "string" || !/^\S+@\S+\.\S+$/.test(input.email.trim())) throw new BadRequestException("A valid email is required");
    if (typeof input.phone !== "string" || !/^\+?[0-9 ()-]{7,25}$/.test(input.phone.trim())) throw new BadRequestException("A valid phone number is required");
    if (input.mode !== "SHORT_STAY" && input.mode !== "LONG_TERM") throw new BadRequestException("A valid rental mode is required");
    if (input.offeringId !== undefined && typeof input.offeringId !== "string") throw new BadRequestException("A valid offering is required");
    if (typeof input.offeringId === "string" && !input.offeringId.trim()) throw new BadRequestException("A valid offering is required");
    if (input.fingerprint !== undefined && typeof input.fingerprint !== "string") throw new BadRequestException("Inquiry payload is invalid");
    if (input.startDate !== undefined && typeof input.startDate !== "string") throw new BadRequestException("startDate must be a valid date");
    if (input.endDate !== undefined && typeof input.endDate !== "string") throw new BadRequestException("endDate must be a valid date");
    if (input.guests != null && (!Number.isInteger(input.guests) || input.guests < 1 || input.guests > 100)) throw new BadRequestException("Guests must be between 1 and 100");
    const start = this.optionalDate(input.startDate, "startDate");
    const end = this.optionalDate(input.endDate, "endDate");
    if (input.mode === "SHORT_STAY" && (!start || !end)) throw new BadRequestException("Short-stay inquiries require both startDate and endDate");
    if (Boolean(start) !== Boolean(end)) throw new BadRequestException("Short-stay inquiries require both startDate and endDate");
    if (start && end && end.getTime() <= start.getTime()) throw new BadRequestException("endDate must be after startDate");
  }

  private async assertRateLimit(input: GuestInquiryRequest, db: any = this.prisma) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedPhone = this.normalizePhone(input.phone);
    const fingerprint = this.normalizeFingerprint(input.fingerprint);
    const now = Date.now();
    if (typeof db.$queryRaw === "function") {
      const cutoff = new Date(now - WINDOW_MS);
      const keys = [`email:${normalizedEmail}`, `phone:${normalizedPhone}`, ...(fingerprint ? [`fingerprint:${fingerprint}`] : [])];
      for (const key of keys) {
        const rows = await db.$queryRaw(Prisma.sql`
          INSERT INTO "InquiryAbuseAttempt"
            ("id", "key", "normalizedEmail", "normalizedPhone", "fingerprint", "attempts", "windowStartedAt", "lastAttemptAt", "createdAt")
          VALUES (${randomUUID()}, ${key}, ${normalizedEmail}, ${normalizedPhone}, ${fingerprint ?? null}, 1, ${new Date(now)}, ${new Date(now)}, ${new Date(now)})
          ON CONFLICT ("key") DO UPDATE SET
            "attempts" = CASE WHEN "lastAttemptAt" < ${cutoff} THEN 1 ELSE "attempts" + 1 END,
            "windowStartedAt" = CASE WHEN "lastAttemptAt" < ${cutoff} THEN EXCLUDED."windowStartedAt" ELSE "windowStartedAt" END,
            "lastAttemptAt" = EXCLUDED."lastAttemptAt",
            "normalizedEmail" = EXCLUDED."normalizedEmail",
            "normalizedPhone" = EXCLUDED."normalizedPhone",
            "fingerprint" = EXCLUDED."fingerprint"
          RETURNING "attempts"
        `);
        if (Number(rows?.[0]?.attempts) > MAX_SUBMISSIONS) throw new ConflictException("Too many inquiries; please try again later");
      }
      return;
    }
    const abuseStore = db.inquiryAbuseAttempt;
    if (abuseStore?.findFirst && abuseStore?.upsert) {
      const cutoff = new Date(now - WINDOW_MS);
      await abuseStore.deleteMany?.({ where: { lastAttemptAt: { lt: cutoff } } });
      const keys = [
        `email:${normalizedEmail}`,
        `phone:${normalizedPhone}`,
        ...(fingerprint ? [`fingerprint:${fingerprint}`] : []),
      ];
      const nowDate = new Date(now);
      for (const key of keys) {
        const existing = await abuseStore.findUnique?.({ where: { key } }) ?? await abuseStore.findFirst?.({ where: { key } });
        const windowOpen = existing && now - new Date(existing.windowStartedAt).getTime() < WINDOW_MS;
        const row = await abuseStore.upsert({
          where: { key },
          create: { key, normalizedEmail, normalizedPhone, fingerprint, attempts: 1, windowStartedAt: nowDate, lastAttemptAt: nowDate },
          update: windowOpen
            ? { attempts: { increment: 1 }, lastAttemptAt: nowDate }
            : { attempts: 1, windowStartedAt: nowDate, lastAttemptAt: nowDate, normalizedEmail, normalizedPhone, fingerprint },
        });
        // Prisma's upsert is atomic on the unique key. Checking the returned
        // counter means concurrent callers cannot all pass a read-before-write
        // limit check.
        if (row?.attempts > MAX_SUBMISSIONS) throw new ConflictException("Too many inquiries; please try again later");
      }
      return;
    }
    this.pruneRateKeys(now);
    const keys = [this.rateKey(normalizedEmail, normalizedPhone, undefined), ...(fingerprint ? [this.rateKey("", "", fingerprint)] : [])];
    const attempts = keys.flatMap((key) => recentGuestSubmissions.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
    if (attempts.length >= MAX_SUBMISSIONS) throw new ConflictException("Too many inquiries; please try again later");
    for (const key of keys) recentGuestSubmissions.set(key, [...(recentGuestSubmissions.get(key) ?? []), now]);
  }

  private async withTransaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
    if (typeof (this.prisma as any).$transaction === "function") return (this.prisma as any).$transaction(work);
    return work(this.prisma as any);
  }

  private normalizePhone(phone: string) { return `+${phone.replace(/\D/g, "")}`; }
  private normalizeFingerprint(value?: string) {
    if (!value) return undefined;
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._:-]/g, "").slice(0, 128);
    return normalized || undefined;
  }
  private rateKey(email: string, phone: string, fingerprint?: string) {
    return createHash("sha256").update(`${email}|${phone}|${fingerprint ?? ""}`).digest("hex");
  }
  private pruneRateKeys(now: number) {
    for (const [key, values] of recentGuestSubmissions) {
      const fresh = values.filter((at) => now - at < WINDOW_MS);
      if (fresh.length) recentGuestSubmissions.set(key, fresh); else recentGuestSubmissions.delete(key);
    }
    while (recentGuestSubmissions.size >= MAX_RATE_KEYS) {
      const first = recentGuestSubmissions.keys().next().value;
      if (first) recentGuestSubmissions.delete(first); else break;
    }
  }

  private resolveOffering(offerings: any[] | undefined, input: GuestInquiryRequest) {
    if (!Array.isArray(offerings) || !offerings.length) return undefined;
    const offering = input.offeringId
      ? offerings.find((candidate) => candidate.id === input.offeringId)
      : offerings.find((candidate) => candidate.mode === input.mode);
    if (!offering || (offering.mode && offering.mode !== input.mode)) throw new BadRequestException("Selected rental mode is unavailable");
    return offering;
  }

  private optionalDate(value: string | undefined, field: string) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) throw new BadRequestException(`${field} must be a valid date`);
    return date;
  }

  private reference() {
    return `BTNA-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
  }

  private publicInquiry(inquiry: any) {
    return {
      id: inquiry.id,
      reference: inquiry.reference,
      status: inquiry.status,
      createdAt: inquiry.createdAt,
    };
  }

  private publicLocation(property: any) {
    return {
      label: property.publicLocationLabel,
      latitude: Number(property.publicLatitude),
      longitude: Number(property.publicLongitude),
    };
  }
}
