import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
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
  private readonly releaseLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit?: AuditService,
  ) {}

  async release(inquiryId: string, actor: InquiryActor, reason?: string) {
    if (!isAdmin(actor)) throw new ForbiddenException("Only admins can release exact location");
    if (reason !== undefined && typeof reason !== "string") throw new BadRequestException("Release reason must be text");
    const previous = this.releaseLocks.get(inquiryId);
    const run = (previous ? previous.catch(() => undefined) : Promise.resolve())
      .then(() => this.releaseOnce(inquiryId, actor, reason));
    this.releaseLocks.set(inquiryId, run);
    try {
      return await run;
    } finally {
      if (this.releaseLocks.get(inquiryId) === run) this.releaseLocks.delete(inquiryId);
    }
  }

  private async releaseOnce(inquiryId: string, actor: InquiryActor, reason?: string) {
    const result = await this.withTransaction(async (tx: any) => {
      await this.lockInquiry(tx, inquiryId);
      let inquiry = await this.findInquiry(tx, inquiryId);
      if (!inquiry) throw new NotFoundException("Inquiry not found");
      if (!inquiry.property?.exactAddress) throw new NotFoundException("Exact location is not available");
      const now = new Date();
      if (inquiry.status === "LOCATION_APPROVED") {
        const expiresAt = inquiry.locationReleaseExpiresAt ? new Date(inquiry.locationReleaseExpiresAt) : null;
        if (!expiresAt) {
          await this.revokeWithinTransaction(tx, inquiry, actor, "Legacy location release had no expiry");
          throw new ConflictException("Location release has no expiry and must be re-approved");
        }
        if (expiresAt.getTime() > now.getTime()) {
          return {
            inquiry,
            location: this.location(inquiry.property),
            releaseToken: inquiry.locationReleaseId,
            idempotent: true,
            releaseId: inquiry.locationReleaseId ?? inquiry.locationApprovedAt?.toISOString() ?? inquiry.id,
          };
        }
        await this.revokeWithinTransaction(tx, inquiry, actor, "Location release expired");
        inquiry = await this.findInquiry(tx, inquiryId);
      }
      if (!["NEW", "CONTACTED", "OWNER_CONFIRMED"].includes(inquiry.status)) {
        throw new ConflictException("Inquiry is not eligible for location release");
      }
      const approvedAt = now;
      const expiresAt = new Date(now.getTime() + LOCATION_RELEASE_TTL_MS);
      const releaseId = randomUUID();
      const data = {
        status: "LOCATION_APPROVED",
        locationApprovedAt: approvedAt,
        locationReleaseExpiresAt: expiresAt,
        locationRevokedAt: null,
        locationReleasedBy: actor.id,
        locationReleaseId: releaseId,
      };
      let claimed = true;
      if (typeof tx.inquiry.updateMany === "function") {
        const claim = await tx.inquiry.updateMany({
          where: { id: inquiryId, status: { in: ["NEW", "CONTACTED", "OWNER_CONFIRMED"] } },
          data,
        });
        claimed = claim.count === 1;
      } else {
        await tx.inquiry.update({ where: { id: inquiryId }, data });
      }
      if (!claimed) {
        const current = await this.findInquiry(tx, inquiryId);
        if (current?.status === "LOCATION_APPROVED" && current.locationReleaseExpiresAt && new Date(current.locationReleaseExpiresAt).getTime() > Date.now()) {
          return {
            inquiry: current,
            location: this.location(current.property),
            idempotent: true,
            releaseId: current.locationReleaseId ?? current.locationApprovedAt?.toISOString() ?? current.id,
          };
        }
        throw new ConflictException("Inquiry is not eligible for location release");
      }
      const updated = await this.findInquiry(tx, inquiryId);
      await this.recordAudit(tx, actor, "EXACT_LOCATION_RELEASED", inquiryId, {
        reason: reason?.trim() || "admin-approved inquiry",
        releaseId,
      });
      return { inquiry: updated, location: this.location(updated.property), releaseToken: releaseId, idempotent: false, releaseId };
    });
    return result;
  }

  async revoke(inquiryId: string, actor: InquiryActor, reason = "Admin revoked location release") {
    if (!isAdmin(actor)) throw new ForbiddenException("Only admins can revoke exact location");
    if (typeof reason !== "string") throw new BadRequestException("Release reason must be text");
    return this.withTransaction(async (tx: any) => {
      await this.lockInquiry(tx, inquiryId);
      const inquiry = await this.findInquiry(tx, inquiryId);
      if (!inquiry) throw new NotFoundException("Inquiry not found");
      if (inquiry.status !== "LOCATION_APPROVED") return { inquiry, revoked: false };
      return this.revokeWithinTransaction(tx, inquiry, actor, reason);
    });
  }

  async getReleasedLocation(inquiryId: string, actor: InquiryActor) {
    if (!isAdmin(actor)) throw new ForbiddenException("Only admins can view exact location");
    const inquiry = await this.findInquiry(this.prisma as any, inquiryId);
    if (!inquiry) throw new NotFoundException("Inquiry not found");
    if (inquiry.status !== "LOCATION_APPROVED") return null;
    if (!inquiry.locationReleaseExpiresAt || new Date(inquiry.locationReleaseExpiresAt).getTime() <= Date.now()) {
      await this.revoke(inquiryId, actor, inquiry.locationReleaseExpiresAt ? "Location release expired" : "Legacy location release had no expiry");
      return null;
    }
    return this.location(inquiry.property);
  }

  /** Visitor read path: an opaque, expiring release token is the only public
   * credential. Inquiry identifiers alone are never sufficient. */
  async getReleasedLocationByToken(token: string) {
    if (typeof token !== "string" || !/^[0-9a-f-]{36}$/i.test(token)) {
      throw new NotFoundException("Released location not found");
    }
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { locationReleaseId: token },
      include: { property: true },
    });
    if (
      !inquiry ||
      inquiry.status !== "LOCATION_APPROVED" ||
      !inquiry.locationReleaseExpiresAt ||
      new Date(inquiry.locationReleaseExpiresAt).getTime() <= Date.now() ||
      inquiry.locationRevokedAt
    ) {
      throw new NotFoundException("Released location not found");
    }
    await this.recordAudit(this.prisma, {}, "EXACT_LOCATION_VIEWED", inquiry.id, {
      releaseId: token,
      channel: "visitor-token",
    });
    return {
      inquiryReference: inquiry.reference,
      expiresAt: inquiry.locationReleaseExpiresAt,
      location: this.location(inquiry.property),
    };
  }

  private async revokeWithinTransaction(tx: any, inquiry: any, actor: InquiryActor, reason: string) {
    const data = {
      status: "CONTACTED",
      locationApprovedAt: null,
      locationRevokedAt: new Date(),
      locationReleaseExpiresAt: null,
      locationReleasedBy: null,
      locationReleaseId: null,
    };
    if (typeof tx.inquiry.updateMany === "function") {
      await tx.inquiry.updateMany({ where: { id: inquiry.id, status: "LOCATION_APPROVED" }, data });
    } else {
      await tx.inquiry.update({ where: { id: inquiry.id }, data });
    }
    const updated = await this.findInquiry(tx, inquiry.id);
    await this.recordAudit(tx, actor, "EXACT_LOCATION_REVOKED", inquiry.id, { reason });
    return { inquiry: updated, revoked: true };
  }

  private async lockInquiry(tx: any, inquiryId: string) {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inquiry" WHERE "id" = ${inquiryId} FOR UPDATE`);
    }
  }

  private async recordAudit(tx: any, actor: { id?: string }, action: string, inquiryId: string, metadata: Record<string, unknown>) {
    if (this.audit?.record) {
      await this.audit.record(tx, {
        actor,
        action,
        entity: { type: "Inquiry", id: inquiryId, metadata: metadata as Prisma.InputJsonValue },
      });
      return;
    }
    if (typeof tx.auditEvent?.create === "function") {
      await tx.auditEvent.create({ data: { actorId: actor.id ?? null, action, entityType: "Inquiry", entityId: inquiryId, metadata: metadata as Prisma.InputJsonValue } });
      return;
    }
    await this.audit?.record(actor, action, { type: "Inquiry", id: inquiryId, metadata: metadata as Prisma.InputJsonValue });
  }

  private async findInquiry(tx: any, inquiryId: string) {
    return tx.inquiry.findUnique({ where: { id: inquiryId }, include: { property: true } });
  }

  private async withTransaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
    if (typeof (this.prisma as any).$transaction === "function") return (this.prisma as any).$transaction(work);
    return work(this.prisma as any);
  }

  private location(property: any) {
    return { exactAddress: property.exactAddress, latitude: this.numberOrNull(property.exactLatitude), longitude: this.numberOrNull(property.exactLongitude) };
  }

  private numberOrNull(value: unknown) {
    return value == null ? null : Number(value);
  }
}
