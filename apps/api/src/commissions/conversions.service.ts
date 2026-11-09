import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

export type ConversionReport = {
  inquiryId: string;
  ownerId: string;
  firstPaymentAmount: number | string;
  firstPaymentCurrency: string;
  paymentEvidence?: string;
};

@Injectable()
export class ConversionsService {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit?: AuditService) {}

  async report(input: ConversionReport | string, ownerId?: string, details?: Omit<ConversionReport, "inquiryId" | "ownerId">) {
    const report = typeof input === "string" ? { inquiryId: input, ownerId: ownerId ?? "", ...(details ?? {}) } as ConversionReport : input;
    const firstPaymentAmount = this.validateReport(report);
    return this.withLock(`inquiry:${report.inquiryId}`, () => this.reportLocked(report, firstPaymentAmount));
  }

  private async reportLocked(report: ConversionReport, firstPaymentAmount: Prisma.Decimal) {
    let created = false;
    let conversion: any;
    try {
      conversion = await this.withTransaction(async (tx: any) => {
        if (typeof tx.$queryRaw === "function") {
          await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inquiry" WHERE "id" = ${report.inquiryId} FOR UPDATE`);
        }
        const inquiry = await tx.inquiry.findUnique({ where: { id: report.inquiryId }, include: { property: true, conversion: true } });
        if (!inquiry) throw new NotFoundException("Inquiry not found");
        if (inquiry.property?.ownerId !== report.ownerId) throw new ForbiddenException("Only the property owner can report a conversion");
        if (!["OWNER_CONFIRMED", "CLOSED"].includes(inquiry.status)) throw new ConflictException("Only a confirmed inquiry can become a conversion");
        const existing = inquiry.conversion ?? await tx.conversion.findUnique?.({ where: { inquiryId: report.inquiryId } });
        if (existing) return existing;
        created = true;
        const conversion = await tx.conversion.create({
          data: {
            inquiryId: report.inquiryId,
            propertyId: inquiry.propertyId,
            ownerId: report.ownerId,
            status: "EVIDENCE_PENDING",
            firstPaymentAmount,
            firstPaymentCurrency: report.firstPaymentCurrency.toUpperCase(),
            paymentEvidence: report.paymentEvidence?.trim() || null,
          },
        });
        await this.recordAudit(tx, { id: report.ownerId }, "CONVERSION_REPORTED", {
          type: "Conversion",
          id: conversion.id,
          metadata: { inquiryId: report.inquiryId },
        });
        return conversion;
      });
    } catch (error: any) {
      if (error?.code !== "P2002") throw error;
      conversion = await (this.prisma as any).conversion.findUnique({ where: { inquiryId: report.inquiryId } });
      if (!conversion) throw error;
      created = false;
    }
    return conversion;
  }

  async verifyEvidence(conversionId: string, staffId: string, input?: string | { paymentEvidence?: string; approved?: boolean }) {
    await this.assertStaff(staffId);
    return this.withTransaction(async (tx: any) => {
      if (typeof tx.$queryRaw === "function") {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Conversion" WHERE "id" = ${conversionId} FOR UPDATE`);
      }
      const conversion = await tx.conversion.findUnique({ where: { id: conversionId } });
      if (!conversion) throw new NotFoundException("Conversion not found");
      if (conversion.status === "VERIFIED") return conversion;
      if (conversion.status === "CANCELLED") throw new ConflictException("Cancelled conversion cannot be verified");
      const evidence = typeof input === "string" ? input : input?.paymentEvidence;
      const approved = typeof input === "object" ? input?.approved !== false : true;
      if (!approved) {
        const cancelled = await tx.conversion.update({ where: { id: conversionId }, data: { status: "CANCELLED", verifiedAt: null, verifiedBy: null } });
        await this.recordAudit(tx, { id: staffId }, "CONVERSION_EVIDENCE_REJECTED", { type: "Conversion", id: conversionId });
        return cancelled;
      }
      const finalEvidence = evidence?.trim() || conversion.paymentEvidence?.trim();
      if (!finalEvidence) throw new BadRequestException("Staff-verified payment evidence is required");
      const verified = await tx.conversion.update({
        where: { id: conversionId },
        data: { status: "VERIFIED", paymentEvidence: finalEvidence, verifiedAt: new Date(), verifiedBy: staffId },
      });
      await this.recordAudit(tx, { id: staffId }, "CONVERSION_EVIDENCE_VERIFIED", { type: "Conversion", id: conversionId });
      return verified;
    });
  }

  async listForAdmin(staffId: string) {
    await this.assertStaff(staffId);
    return (this.prisma as any).conversion.findMany?.({ include: { inquiry: true, property: true, owner: true, commission: true }, orderBy: { reportedAt: "desc" } }) ?? [];
  }

  async listForOwner(ownerId: string) {
    return (this.prisma as any).conversion.findMany?.({ where: { ownerId }, include: { inquiry: true, commission: true }, orderBy: { reportedAt: "desc" } }) ?? [];
  }

  private validateReport(report: ConversionReport) {
    if (!report?.inquiryId || !report.ownerId) throw new BadRequestException("Inquiry and owner are required");
    const amount = this.money(report.firstPaymentAmount, "First payment amount");
    if (amount.lte(0)) throw new BadRequestException("First payment amount must be positive");
    if (typeof report.firstPaymentCurrency !== "string" || !/^[A-Za-z]{3}$/.test(report.firstPaymentCurrency)) throw new BadRequestException("First payment currency must be a three-letter code");
    return amount;
  }

  private money(value: unknown, label: string) {
    if (typeof value !== "string" && typeof value !== "number") throw new BadRequestException(`${label} must be a valid decimal`);
    const raw = String(value).trim();
    if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new BadRequestException(`${label} must be a valid decimal`);
    try {
      const amount = new Prisma.Decimal(raw).toDecimalPlaces(2);
      if (!amount.isFinite()) throw new Error("non-finite");
      return amount;
    } catch {
      throw new BadRequestException(`${label} must be a valid decimal`);
    }
  }

  private async assertStaff(staffId: string) {
    if (!staffId?.trim()) throw new ForbiddenException("Staff access required");
    const user = await (this.prisma as any).user?.findUnique?.({ where: { id: staffId }, include: { roles: { include: { role: true } } } });
    const roles = user?.roles?.map((entry: any) => String(entry?.role?.name ?? entry?.name ?? "").toUpperCase()) ?? [];
    if (!user || user.status !== "ACTIVE" || !roles.some((role: string) => ["ADMIN", "STAFF"].includes(role))) throw new ForbiddenException("Staff access required");
  }

  private async withTransaction<T>(work: (tx: any) => Promise<T>) {
    if (typeof (this.prisma as any).$transaction === "function") return (this.prisma as any).$transaction(work);
    return work(this.prisma as any);
  }

  private async recordAudit(tx: any, actor: { id: string }, action: string, entity: any) {
    if (this.audit?.record) return this.audit.record(tx, { actor, action, entity });
    if (typeof tx.auditEvent?.create === "function") {
      return tx.auditEvent.create({ data: {
        actorId: actor.id,
        action,
        entityType: entity.type ?? entity.entityType,
        entityId: entity.id ?? entity.entityId,
        metadata: entity.metadata ?? {},
      } });
    }
  }

  private async withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(key, current);
    await previous;
    try { return await work(); } finally {
      release();
      if (this.locks.get(key) === current) this.locks.delete(key);
    }
  }
}
