import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import { NotificationEvent, NotificationService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

const PENDING_INQUIRY_STATUSES = ["NEW", "CONTACTED", "LOCATION_APPROVED"];

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  async confirmInquiryAndBlockDates(inquiryId: string, ownerId: string, ownerResponseMessage?: string) {
    if (!inquiryId || !ownerId) throw new BadRequestException("Inquiry and owner are required");
    const result = await this.withTransaction(async (tx: any) => {
      const inquiry = await this.findInquiry(tx, inquiryId);
      this.assertOwner(inquiry, ownerId);
      if (inquiry.status === "OWNER_DECLINED") throw new ConflictException("Inquiry has been declined");
      if (![...PENDING_INQUIRY_STATUSES, "OWNER_CONFIRMED"].includes(inquiry.status)) {
        throw new ConflictException("Inquiry cannot be confirmed in its current state");
      }

      const mode = this.modeOf(inquiry);
      const hasStart = inquiry.startDate != null;
      const hasEnd = inquiry.endDate != null;
      if (hasStart !== hasEnd) throw new BadRequestException("Short-stay inquiries require both startDate and endDate");
      const shortStay = mode === "SHORT_STAY" || (!mode && hasStart && hasEnd);
      if (mode === "SHORT_STAY" && (!hasStart || !hasEnd)) {
        throw new BadRequestException("Short-stay confirmation requires startDate and endDate");
      }
      if (!shortStay) {
        const updated = inquiry.status === "OWNER_CONFIRMED"
          ? inquiry
          : await tx.inquiry.update({ where: { id: inquiryId }, data: { status: "OWNER_CONFIRMED" } });
        await this.recordAudit(tx, { id: ownerId }, "INQUIRY_OWNER_CONFIRMED", { type: "Inquiry", id: inquiryId });
        return { inquiry: updated, blocked: false, declinedInquiryIds: [] };
      }

      const startDate = this.date(inquiry.startDate, "startDate");
      const endDate = this.date(inquiry.endDate, "endDate");
      if (endDate <= startDate) throw new BadRequestException("endDate must be after startDate");

      // Locking the property serializes confirmations across API instances. The
      // exclusion constraint in the migration is the final database backstop.
      if (typeof tx.$queryRaw === "function") {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Property" WHERE "id" = ${inquiry.propertyId} FOR UPDATE`);
      }

      const blockStore = tx.availabilityBlock;
      const existingBlocks = typeof blockStore?.findMany === "function"
        ? await blockStore.findMany({ where: { propertyId: inquiry.propertyId, startDate: { lt: endDate }, endDate: { gt: startDate } } })
        : [];
      const conflictingBlock = existingBlocks.find((block: any) => block.inquiryId !== inquiryId);
      if (conflictingBlock) throw new ConflictException("Those dates are no longer available");

      const unavailableStore = tx.unavailableDate;
      const unavailableDates = typeof unavailableStore?.findMany === "function"
        ? await unavailableStore.findMany({
            where: {
              propertyId: inquiry.propertyId,
              startDate: { lt: endDate },
              endDate: { gt: startDate },
            },
          })
        : typeof unavailableStore?.findFirst === "function"
          ? [await unavailableStore.findFirst({
              where: {
                propertyId: inquiry.propertyId,
                startDate: { lt: endDate },
                endDate: { gt: startDate },
              },
            })].filter(Boolean)
          : [];
      if (unavailableDates.length > 0) {
        throw new ConflictException("Those dates are unavailable");
      }

      let block = existingBlocks.find((candidate: any) => candidate.inquiryId === inquiryId);
      if (!block) {
        try {
          block = await blockStore.create({
            data: { id: randomUUID(), propertyId: inquiry.propertyId, inquiryId, startDate, endDate },
          });
        } catch (error: any) {
          if (error?.code === "P2002" || error?.code === "23P01" || error?.code === "P2034") {
            throw new ConflictException("Those dates are no longer available");
          }
          throw error;
        }
      }

      const responseData = ownerResponseMessage?.trim()
        ? { ownerResponseMessage: ownerResponseMessage.trim() }
        : {};
      const updated = inquiry.status === "OWNER_CONFIRMED" && !Object.keys(responseData).length
        ? inquiry
        : await tx.inquiry.update({ where: { id: inquiryId }, data: { status: "OWNER_CONFIRMED", ...responseData } });
      const overlapping = await this.findOverlappingPending(tx, inquiry, startDate, endDate);
      const declinedInquiryIds: string[] = [];
      const declinedInquiries: any[] = [];
      for (const candidate of overlapping) {
        if (candidate.id === inquiryId) continue;
        const result = await tx.inquiry.updateMany({
          where: { id: candidate.id, status: { in: PENDING_INQUIRY_STATUSES } },
          data: { status: "OWNER_DECLINED" },
        });
        if (result?.count !== 0) {
          declinedInquiryIds.push(candidate.id);
          declinedInquiries.push(candidate);
        }
      }
      await this.recordAudit(tx, { id: ownerId }, "INQUIRY_DATES_BLOCKED", {
        type: "Inquiry",
        id: inquiryId,
        metadata: { startDate, endDate, declinedInquiryIds },
      });
      await this.recordAudit(tx, { id: ownerId }, "INQUIRY_OWNER_CONFIRMED", { type: "Inquiry", id: inquiryId });
      return { inquiry: updated, block, blocked: true, declinedInquiryIds, declinedInquiries };
    });
    await this.notifyAutoDeclines(result.declinedInquiries ?? [], result.inquiry);
    return result;
  }

  async ownerDeclineInquiry(inquiryId: string, ownerId: string) {
    return this.withTransaction(async (tx: any) => {
      const inquiry = await this.findInquiry(tx, inquiryId);
      this.assertOwner(inquiry, ownerId);
      if (!PENDING_INQUIRY_STATUSES.includes(inquiry.status)) throw new ConflictException("Inquiry has already been decided");
      const updated = await tx.inquiry.update({ where: { id: inquiryId }, data: { status: "OWNER_DECLINED" } });
      await this.recordAudit(tx, { id: ownerId }, "INQUIRY_OWNER_DECLINED", { type: "Inquiry", id: inquiryId });
      return updated;
    });
  }

  async listForOwner(ownerId: string, propertyId?: string) {
    const where: any = { property: { ownerId } };
    if (propertyId) where.propertyId = propertyId;
    return (this.prisma as any).availabilityBlock?.findMany?.({ where, include: { property: true, inquiry: true }, orderBy: { startDate: "asc" } }) ?? [];
  }

  async listForAdmin() {
    return (this.prisma as any).availabilityBlock?.findMany?.({ include: { property: true, inquiry: true }, orderBy: { startDate: "asc" } }) ?? [];
  }

  async listUnavailableForOwner(ownerId: string, propertyId?: string) {
    const where: any = { property: { ownerId } };
    if (propertyId) where.propertyId = propertyId;
    return (this.prisma as any).unavailableDate?.findMany?.({
      where,
      include: { property: true },
      orderBy: { startDate: "asc" },
    }) ?? [];
  }

  async createUnavailableDate(
    ownerId: string,
    input: { propertyId: string; startDate: string | Date; endDate: string | Date; reason?: string },
  ) {
    const { propertyId, startDate, endDate } = this.validateUnavailableInput(input);
    await this.assertPropertyOwner(propertyId, ownerId);
    return this.withTransaction(async (tx: any) => {
      await this.lockProperty(tx, propertyId);
      const store = tx.unavailableDate;
      if (!store?.create) return { propertyId, startDate, endDate, reason: input.reason?.trim() || null };
      const overlap = await store.findFirst?.({ where: { propertyId, startDate: { lt: endDate }, endDate: { gt: startDate } } });
      if (overlap) throw new ConflictException("Those dates are already unavailable");
      const created = await store.create({ data: { propertyId, startDate, endDate, reason: input.reason?.trim() || null } });
      if (created?.id) await this.recordAudit(tx, { id: ownerId }, "UNAVAILABLE_DATE_CREATED", { type: "UnavailableDate", id: created.id });
      return created;
    });
  }

  async updateUnavailableDate(
    ownerId: string,
    id: string,
    input: { startDate?: string | Date; endDate?: string | Date; reason?: string },
  ) {
    return this.withTransaction(async (tx: any) => {
      const store = tx.unavailableDate;
      const existing = await store?.findUnique?.({ where: { id }, include: { property: true } });
      if (!existing || existing.property?.ownerId !== ownerId) throw new NotFoundException("Unavailable date not found");
      await this.lockProperty(tx, existing.propertyId);
      const values = this.validateUnavailableInput({ propertyId: existing.propertyId, startDate: input.startDate ?? existing.startDate, endDate: input.endDate ?? existing.endDate });
      const overlap = await store.findFirst?.({ where: { id: { not: id }, propertyId: existing.propertyId, startDate: { lt: values.endDate }, endDate: { gt: values.startDate } } });
      if (overlap) throw new ConflictException("Those dates are already unavailable");
      const updated = await store.update({ where: { id }, data: { startDate: values.startDate, endDate: values.endDate, ...(input.reason !== undefined ? { reason: input.reason?.trim() || null } : {}) } });
      await this.recordAudit(tx, { id: ownerId }, "UNAVAILABLE_DATE_UPDATED", { type: "UnavailableDate", id });
      return updated;
    });
  }

  async deleteUnavailableDate(ownerId: string, id: string) {
    return this.withTransaction(async (tx: any) => {
      const store = tx.unavailableDate;
      const existing = await store?.findUnique?.({ where: { id }, include: { property: true } });
      if (!existing || existing.property?.ownerId !== ownerId) throw new NotFoundException("Unavailable date not found");
      await this.lockProperty(tx, existing.propertyId);
      const deleted = await store.delete({ where: { id } });
      await this.recordAudit(tx, { id: ownerId }, "UNAVAILABLE_DATE_DELETED", { type: "UnavailableDate", id });
      return deleted;
    });
  }

  private async findInquiry(tx: any, inquiryId: string) {
    const inquiry = await tx.inquiry.findUnique({ where: { id: inquiryId }, include: { property: { include: { owner: true } }, offering: true } });
    if (!inquiry) throw new NotFoundException("Inquiry not found");
    return inquiry;
  }

  private async findOverlappingPending(tx: any, inquiry: any, startDate: Date, endDate: Date) {
    const rows = await tx.inquiry.findMany({
      where: {
        propertyId: inquiry.propertyId,
        id: { not: inquiry.id },
        status: { in: PENDING_INQUIRY_STATUSES },
        startDate: { lt: endDate },
        endDate: { gt: startDate },
      },
      include: { offering: true },
    });
    return rows.filter((candidate: any) => {
      const candidateMode = this.modeOf(candidate);
      if (candidateMode && candidateMode !== "SHORT_STAY") return false;
      if (!candidate.startDate || !candidate.endDate) return false;
      return new Date(candidate.startDate) < endDate && new Date(candidate.endDate) > startDate;
    });
  }

  private modeOf(inquiry: any): string | undefined {
    return inquiry?.offering?.mode ?? inquiry?.mode;
  }

  private async notifyAutoDeclines(candidates: any[], winner: any) {
    if (!this.notifications) return;
    for (const candidate of candidates) {
      const event: NotificationEvent = {
        type: "INQUIRY_AUTO_DECLINED_OVERLAP",
        inquiryId: candidate.id,
        reference: candidate.reference,
        recipients: [{ userId: candidate.guestUserId, email: candidate.guestEmail, phone: candidate.guestPhone }],
        subject: `Betna update for inquiry ${candidate.reference ?? candidate.id}`,
        body: `The dates requested in inquiry ${candidate.reference ?? candidate.id} are no longer available because another inquiry was confirmed.`,
        idempotencyKey: `inquiry-auto-declined-overlap:${winner.id}:${candidate.id}`,
        payload: { status: "OWNER_DECLINED", winnerInquiryId: winner.id },
      };
      await this.notifications.enqueue(event);
    }
  }

  private assertOwner(inquiry: any, ownerId: string) {
    if (inquiry.property?.ownerId !== ownerId && inquiry.property?.owner?.id !== ownerId) {
      throw new ForbiddenException("Only the property owner can manage availability");
    }
  }

  private async assertPropertyOwner(propertyId: string, ownerId: string) {
    const property = await (this.prisma as any).property?.findFirst?.({ where: { id: propertyId, ownerId }, select: { id: true } });
    if (!property) throw new ForbiddenException("Only the property owner can manage availability");
  }

  private validateUnavailableInput(input: { propertyId: string; startDate: string | Date; endDate: string | Date }) {
    if (!input.propertyId) throw new BadRequestException("Property is required");
    const startDate = this.date(input.startDate, "startDate");
    const endDate = this.date(input.endDate, "endDate");
    if (endDate <= startDate) throw new BadRequestException("endDate must be after startDate");
    return { propertyId: input.propertyId, startDate, endDate };
  }

  private date(value: unknown, field: string) {
    const date = new Date(value as any);
    if (Number.isNaN(date.valueOf())) throw new BadRequestException(`${field} must be a valid date`);
    return date;
  }

  private async withTransaction<T>(work: (tx: any) => Promise<T>) {
    if (typeof (this.prisma as any).$transaction === "function") return (this.prisma as any).$transaction(work);
    return work(this.prisma as any);
  }

  private async recordAudit(tx: any, actor: { id: string }, action: string, entity: any) {
    if (this.audit?.record) {
      return this.audit.record(tx, { actor, action, entity });
    }
    if (typeof tx.auditEvent?.create === "function") {
      return tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action,
          entityType: entity.type ?? entity.entityType,
          entityId: entity.id ?? entity.entityId,
          metadata: entity.metadata ?? {},
        },
      });
    }
  }

  private async lockProperty(tx: any, propertyId: string) {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Property" WHERE "id" = ${propertyId} FOR UPDATE`);
    }
  }
}
