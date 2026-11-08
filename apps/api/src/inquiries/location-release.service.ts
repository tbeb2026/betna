import { ConflictException, ForbiddenException, NotFoundException, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

export interface InquiryActor {
  id: string;
  roles?: string[];
}

export const LOCATION_RELEASE_TTL_MS = 24 * 60 * 60 * 1000;

function isAdmin(actor: InquiryActor | undefined) {
  return (actor?.roles ?? []).some((role) => role.toUpperCase() === "ADMIN");
}

@Injectable()
export class LocationReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit?: AuditService,
  ) {}

  async release(inquiryId: string, actor: InquiryActor, reason?: string) {
    if (!isAdmin(actor)) throw new ForbiddenException("Only admins can release exact location");
    const inquiry = await (this.prisma as any).inquiry.findUnique({
      where: { id: inquiryId },
      include: { property: true },
    });
    if (!inquiry) throw new NotFoundException("Inquiry not found");
    if (!inquiry.property?.exactAddress) {
      throw new NotFoundException("Exact location is not available");
    }

    const now = new Date();
    if (inquiry.status === "LOCATION_APPROVED") {
      const expiresAt = inquiry.locationReleaseExpiresAt
        ? new Date(inquiry.locationReleaseExpiresAt)
        : null;
      if (!expiresAt || expiresAt.getTime() > now.getTime()) {
        return {
          inquiry,
          location: this.location(inquiry.property),
          idempotent: true,
        };
      }
      await this.revoke(inquiryId, actor, "Location release expired");
      inquiry.status = "CONTACTED";
      inquiry.locationReleaseExpiresAt = null;
    }
    if (!["NEW", "CONTACTED", "OWNER_CONFIRMED"].includes(inquiry.status)) {
      throw new ConflictException("Inquiry is not eligible for location release");
    }

    const approvedAt = now;
    const expiresAt = new Date(now.getTime() + LOCATION_RELEASE_TTL_MS);
    const updated = await (this.prisma as any).inquiry.update({
      where: { id: inquiryId },
      data: {
        status: "LOCATION_APPROVED",
        locationApprovedAt: approvedAt,
        locationReleaseExpiresAt: expiresAt,
        locationRevokedAt: null,
        locationReleasedBy: actor.id,
      },
      include: { property: true },
    });
    await this.audit?.record(actor, "EXACT_LOCATION_RELEASED", {
      type: "Inquiry",
      id: inquiryId,
      metadata: { reason: reason?.trim() || "admin-approved inquiry" },
    });
    const property = updated.property ?? inquiry.property;
    return {
      inquiry: updated,
      location: this.location(property),
      idempotent: false,
    };
  }

  async revoke(inquiryId: string, actor: InquiryActor, reason = "Admin revoked location release") {
    if (!isAdmin(actor)) throw new ForbiddenException("Only admins can revoke exact location");
    const inquiry = await (this.prisma as any).inquiry.findUnique({ where: { id: inquiryId }, include: { property: true } });
    if (!inquiry) throw new NotFoundException("Inquiry not found");
    if (inquiry.status !== "LOCATION_APPROVED") return { inquiry, revoked: false };
    const updated = await (this.prisma as any).inquiry.update({
      where: { id: inquiryId },
      data: {
        status: "CONTACTED",
        locationApprovedAt: null,
        locationRevokedAt: new Date(),
        locationReleaseExpiresAt: null,
        locationReleasedBy: null,
      },
      include: { property: true },
    });
    await this.audit?.record(actor, "EXACT_LOCATION_REVOKED", {
      type: "Inquiry",
      id: inquiryId,
      metadata: { reason: typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : "Admin revoked location release" },
    });
    return { inquiry: updated, revoked: true };
  }

  async getReleasedLocation(inquiryId: string, actor: InquiryActor) {
    if (!isAdmin(actor)) throw new ForbiddenException("Only admins can view exact location");
    const inquiry = await (this.prisma as any).inquiry.findUnique({
      where: { id: inquiryId },
      include: { property: true },
    });
    if (!inquiry) throw new NotFoundException("Inquiry not found");
    if (inquiry.status !== "LOCATION_APPROVED") return null;
    if (inquiry.locationReleaseExpiresAt && new Date(inquiry.locationReleaseExpiresAt).getTime() <= Date.now()) {
      await this.revoke(inquiryId, actor, "Location release expired");
      return null;
    }
    return this.location(inquiry.property);
  }

  private location(property: any) {
    return {
      exactAddress: property.exactAddress,
      latitude: this.numberOrNull(property.exactLatitude),
      longitude: this.numberOrNull(property.exactLongitude),
    };
  }

  private numberOrNull(value: unknown) {
    return value == null ? null : Number(value);
  }
}
