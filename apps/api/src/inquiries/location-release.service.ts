import { ForbiddenException, NotFoundException, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

export interface InquiryActor {
  id: string;
  roles?: string[];
}

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

    const approvedAt = new Date();
    const updated = await (this.prisma as any).inquiry.update({
      where: { id: inquiryId },
      data: { status: "LOCATION_APPROVED", locationApprovedAt: approvedAt },
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
      location: {
        exactAddress: property.exactAddress,
        latitude: this.numberOrNull(property.exactLatitude),
        longitude: this.numberOrNull(property.exactLongitude),
      },
    };
  }

  async getReleasedLocation(inquiryId: string, actor: InquiryActor) {
    if (!isAdmin(actor)) throw new ForbiddenException("Only admins can view exact location");
    const inquiry = await (this.prisma as any).inquiry.findUnique({
      where: { id: inquiryId },
      include: { property: true },
    });
    if (!inquiry) throw new NotFoundException("Inquiry not found");
    if (inquiry.status !== "LOCATION_APPROVED") return null;
    return {
      exactAddress: inquiry.property.exactAddress,
      latitude: this.numberOrNull(inquiry.property.exactLatitude),
      longitude: this.numberOrNull(inquiry.property.exactLongitude),
    };
  }

  private numberOrNull(value: unknown) {
    return value == null ? null : Number(value);
  }
}
