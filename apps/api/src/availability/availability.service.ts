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
import { PrismaService } from "../prisma/prisma.service";

const PENDING_INQUIRY_STATUSES = ["NEW", "CONTACTED", "LOCATION_APPROVED"];

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async confirmInquiryAndBlockDates(inquiryId: string, ownerId: string) {
    if (!inquiryId || !ownerId) throw new BadRequestException("Inquiry and owner are required");
    return this.withTransaction(async (tx: any) => {
      const inquiry = await this.findInquiry(tx, inquiryId);
      this.assertOwner(inquiry, ownerId);
      if (inquiry.status === "OWNER_DECLINED") throw new ConflictException("Inquiry has been declined");
      if (![...PENDING_INQUIRY_STATUSES, "OWNER_CONFIRMED"].includes(inquiry.status)) {
        throw new ConflictException("Inquiry cannot be confirmed in its current state");
      }

      const mode = inquiry.offering?.mode ?? inquiry.mode;
      if (mode !== "SHORT_STAY" || !inquiry.startDate || !inquiry.endDate) {
        const updated = inquiry.status === "OWNER_CONFIRMED"
          ? inquiry
          : await tx.inquiry.update({ where: { id: inquiryId }, data: { status: "OWNER_CONFIRMED" } });
        await this.audit?.record({ id: ownerId }, "INQUIRY_OWNER_CONFIRMED", { type: "Inquiry", id: inquiryId });
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

      const updated = inquiry.status === "OWNER_CONFIRMED"
        ? inquiry
        : await tx.inquiry.update({ where: { id: inquiryId }, data: { status: "OWNER_CONFIRMED" } });
      const overlapping = await this.findOverlappingPending(tx, inquiry, startDate, endDate);
      const declinedInquiryIds: string[] = [];
      for (const candidate of overlapping) {
        if (candidate.id === inquiryId) continue;
        const result = await tx.inquiry.updateMany({
          where: { id: candidate.id, status: { in: PENDING_INQUIRY_STATUSES } },
          data: { status: "OWNER_DECLINED" },
        });
        if (result?.count !== 0) declinedInquiryIds.push(candidate.id);
      }
      await this.audit?.record({ id: ownerId }, "INQUIRY_DATES_BLOCKED", {
        type: "Inquiry",
        id: inquiryId,
        metadata: { startDate, endDate, declinedInquiryIds },
      });
      await this.audit?.record({ id: ownerId }, "INQUIRY_OWNER_CONFIRMED", { type: "Inquiry", id: inquiryId });
      return { inquiry: updated, block, blocked: true, declinedInquiryIds };
    });
  }

  async ownerDeclineInquiry(inquiryId: string, ownerId: string) {
    return this.withTransaction(async (tx: any) => {
      const inquiry = await this.findInquiry(tx, inquiryId);
      this.assertOwner(inquiry, ownerId);
      if (!PENDING_INQUIRY_STATUSES.includes(inquiry.status)) throw new ConflictException("Inquiry has already been decided");
      const updated = await tx.inquiry.update({ where: { id: inquiryId }, data: { status: "OWNER_DECLINED" } });
      await this.audit?.record({ id: ownerId }, "INQUIRY_OWNER_DECLINED", { type: "Inquiry", id: inquiryId });
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
        offering: { mode: "SHORT_STAY" },
      },
      include: { offering: true },
    });
    return rows.filter((candidate: any) => {
      const candidateMode = candidate.offering?.mode ?? candidate.mode;
      if (candidateMode && candidateMode !== "SHORT_STAY") return false;
      if (!candidate.startDate || !candidate.endDate) return false;
      return new Date(candidate.startDate) < endDate && new Date(candidate.endDate) > startDate;
    });
  }

  private assertOwner(inquiry: any, ownerId: string) {
    if (inquiry.property?.ownerId !== ownerId && inquiry.property?.owner?.id !== ownerId) {
      throw new ForbiddenException("Only the property owner can manage availability");
    }
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
}
