import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { GuestInquiryInput } from "@betna/contracts";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationEvent, NotificationService } from "../notifications/notifications.service";
import { InquiryActor, LocationReleaseService } from "./location-release.service";

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

@Injectable()
export class InquiriesService {
  private readonly locationRelease: LocationReleaseService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: Pick<NotificationService, "enqueue">,
    audit?: AuditService,
    locationRelease?: LocationReleaseService,
  ) {
    this.audit = audit;
    this.locationRelease = locationRelease ?? new LocationReleaseService(prisma, audit);
  }

  private readonly audit?: AuditService;

  async createGuestInquiry(input: GuestInquiryRequest) {
    this.validateGuestInput(input);
    this.assertRateLimit(input);
    const property = await (this.prisma as any).property.findUnique({
      where: { id: input.propertyId },
      include: { owner: true, offerings: true },
    });
    if (!property || (property.status && property.status !== "PUBLISHED")) {
      throw new NotFoundException("Published property not found");
    }
    const offering = this.resolveOffering(property.offerings, input);
    const inquiry = await (this.prisma as any).inquiry.create({
      data: {
        reference: this.reference(),
        propertyId: input.propertyId,
        offeringId: input.offeringId ?? offering?.id,
        status: "NEW",
        guestName: input.name.trim(),
        guestEmail: input.email.trim().toLowerCase(),
        guestPhone: input.phone.trim(),
        message: input.message.trim(),
        startDate: this.optionalDate(input.startDate, "startDate"),
        endDate: this.optionalDate(input.endDate, "endDate"),
        guests: input.guests,
      },
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
    const decision = typeof response === "string" ? response : response.decision;
    if (decision !== "CONFIRMED" && decision !== "DECLINED") {
      throw new BadRequestException("Owner decision must be CONFIRMED or DECLINED");
    }
    const inquiry = await this.findInquiry(inquiryId);
    if (inquiry.property?.ownerId !== ownerId && inquiry.property?.owner?.id !== ownerId) {
      throw new ForbiddenException("Only the property owner can respond");
    }
    if (["CLOSED", "OWNER_CONFIRMED", "OWNER_DECLINED"].includes(inquiry.status)) {
      throw new ConflictException("Inquiry has already been decided");
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
    await this.notifications.enqueue({
      type: "INQUIRY_LOCATION_APPROVED",
      inquiryId,
      reference: released.inquiry.reference,
      recipients: [
        {
          email: released.inquiry.guestEmail,
          phone: released.inquiry.guestPhone,
        },
      ],
      body: `Betna approved the protected location for inquiry ${released.inquiry.reference}.`,
      payload: { status: released.inquiry.status },
    });
    return released;
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
    if (!input.propertyId || !["BETNA", "OWNER"].includes(input.target) || !["WHATSAPP", "EMAIL"].includes(input.channel)) {
      throw new BadRequestException("Invalid contact click");
    }
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
      include: { property: { include: { owner: true } } },
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
    if (input.honeypot?.trim()) throw new BadRequestException("Inquiry could not be submitted");
    if (!input.propertyId || !input.name?.trim() || !input.message?.trim()) throw new BadRequestException("Name, message and property are required");
    if (!/^\S+@\S+\.\S+$/.test(input.email?.trim() ?? "")) throw new BadRequestException("A valid email is required");
    if (!/^\+?[0-9 ()-]{7,25}$/.test(input.phone?.trim() ?? "")) throw new BadRequestException("A valid phone number is required");
    if (input.guests != null && (!Number.isInteger(input.guests) || input.guests < 1 || input.guests > 100)) throw new BadRequestException("Guests must be between 1 and 100");
  }

  private assertRateLimit(input: GuestInquiryRequest) {
    const key = `${input.email.trim().toLowerCase()}:${input.phone.trim()}`;
    const now = Date.now();
    const attempts = (recentGuestSubmissions.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
    if (attempts.length >= MAX_SUBMISSIONS) throw new ConflictException("Too many inquiries; please try again later");
    attempts.push(now);
    recentGuestSubmissions.set(key, attempts);
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
