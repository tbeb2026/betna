import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
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
  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit?: AuditService) {}

  async report(input: ConversionReport | string, ownerId?: string, details?: Omit<ConversionReport, "inquiryId" | "ownerId">) {
    const report = typeof input === "string" ? { inquiryId: input, ownerId: ownerId ?? "", ...(details ?? {}) } as ConversionReport : input;
    this.validateReport(report);
    const inquiry = await (this.prisma as any).inquiry.findUnique({ where: { id: report.inquiryId }, include: { property: true, conversion: true } });
    if (!inquiry) throw new NotFoundException("Inquiry not found");
    if (inquiry.property?.ownerId !== report.ownerId) throw new ForbiddenException("Only the property owner can report a conversion");
    if (!["OWNER_CONFIRMED", "CLOSED"].includes(inquiry.status)) throw new ConflictException("Only a confirmed inquiry can become a conversion");
    if (inquiry.conversion) return inquiry.conversion;
    const conversion = await (this.prisma as any).conversion.create({
      data: {
        inquiryId: report.inquiryId,
        propertyId: inquiry.propertyId,
        ownerId: report.ownerId,
        status: "EVIDENCE_PENDING",
        firstPaymentAmount: Number(report.firstPaymentAmount),
        firstPaymentCurrency: report.firstPaymentCurrency.toUpperCase(),
        paymentEvidence: report.paymentEvidence?.trim() || null,
      },
    });
    await this.audit?.record({ id: report.ownerId }, "CONVERSION_REPORTED", { type: "Conversion", id: conversion.id, metadata: { inquiryId: report.inquiryId } });
    return conversion;
  }

  async verifyEvidence(conversionId: string, staffId: string, input?: string | { paymentEvidence?: string; approved?: boolean }) {
    const conversion = await (this.prisma as any).conversion.findUnique({ where: { id: conversionId } });
    if (!conversion) throw new NotFoundException("Conversion not found");
    const evidence = typeof input === "string" ? input : input?.paymentEvidence;
    const approved = typeof input === "object" ? input?.approved !== false : true;
    if (!approved) {
      const cancelled = await (this.prisma as any).conversion.update({ where: { id: conversionId }, data: { status: "CANCELLED", verifiedAt: null, verifiedBy: null } });
      await this.audit?.record({ id: staffId }, "CONVERSION_EVIDENCE_REJECTED", { type: "Conversion", id: conversionId });
      return cancelled;
    }
    const finalEvidence = evidence?.trim() || conversion.paymentEvidence?.trim();
    if (!finalEvidence) throw new BadRequestException("Staff-verified payment evidence is required");
    const verified = await (this.prisma as any).conversion.update({
      where: { id: conversionId },
      data: { status: "VERIFIED", paymentEvidence: finalEvidence, verifiedAt: new Date(), verifiedBy: staffId },
    });
    await this.audit?.record({ id: staffId }, "CONVERSION_EVIDENCE_VERIFIED", { type: "Conversion", id: conversionId });
    return verified;
  }

  async listForAdmin() {
    return (this.prisma as any).conversion.findMany?.({ include: { inquiry: true, property: true, owner: true, commission: true }, orderBy: { reportedAt: "desc" } }) ?? [];
  }

  async listForOwner(ownerId: string) {
    return (this.prisma as any).conversion.findMany?.({ where: { ownerId }, include: { inquiry: true, commission: true }, orderBy: { reportedAt: "desc" } }) ?? [];
  }

  private validateReport(report: ConversionReport) {
    if (!report?.inquiryId || !report.ownerId) throw new BadRequestException("Inquiry and owner are required");
    const amount = Number(report.firstPaymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException("First payment amount must be positive");
    if (typeof report.firstPaymentCurrency !== "string" || !/^[A-Za-z]{3}$/.test(report.firstPaymentCurrency)) throw new BadRequestException("First payment currency must be a three-letter code");
  }
}
