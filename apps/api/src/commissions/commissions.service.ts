import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

type CommissionConfig = { commissionPercentage?: number };

@Injectable()
export class CommissionsService {
  private readonly config: CommissionConfig;

  constructor(private readonly prisma: PrismaService, @Optional() auditOrConfig?: AuditService | CommissionConfig, @Optional() config?: CommissionConfig) {
    this.audit = (auditOrConfig && "record" in (auditOrConfig as any)) ? auditOrConfig as AuditService : undefined;
    this.config = config ?? ((auditOrConfig && !("record" in (auditOrConfig as any))) ? auditOrConfig as CommissionConfig : {});
  }

  private readonly audit?: AuditService;

  async markDue(conversionId: string, staffId?: string) {
    if (!conversionId) throw new BadRequestException("Conversion is required");
    const conversion = await (this.prisma as any).conversion.findUnique({ where: { id: conversionId }, include: { commission: true } });
    if (!conversion) throw new NotFoundException("Conversion not found");
    if (conversion.commission?.status === "COMMISSION_DUE" || conversion.commission?.status === "PAID") return conversion.commission;
    if (conversion.status !== "VERIFIED" || !conversion.verifiedAt || !conversion.verifiedBy || !conversion.paymentEvidence || conversion.firstPaymentAmount == null || !conversion.firstPaymentCurrency) {
      throw new ConflictException("Commission requires staff-verified first-payment evidence");
    }
    if (staffId) await this.assertStaff(staffId);
    const percentage = this.percentage();
    const firstPaymentAmount = Number(conversion.firstPaymentAmount);
    const amountDue = Math.round(firstPaymentAmount * percentage) / 100;
    if (!Number.isFinite(amountDue) || amountDue <= 0) throw new BadRequestException("Commission amount is invalid");
    const create = async (tx: any) => tx.commission.create({ data: {
      conversionId,
      ownerId: conversion.ownerId,
      status: "COMMISSION_DUE",
      percentage,
      firstPaymentAmount,
      amountDue,
      currency: conversion.firstPaymentCurrency,
      evidence: conversion.paymentEvidence,
    } });
    const commission = typeof (this.prisma as any).$transaction === "function" ? await (this.prisma as any).$transaction(create) : await create(this.prisma as any);
    await this.audit?.record(staffId ? { id: staffId } : null, "COMMISSION_MARKED_DUE", { type: "Commission", id: commission.id, metadata: { conversionId, percentage } });
    return commission;
  }

  async markPaid(commissionId: string, staffId?: string) {
    const commission = await this.getCommission(commissionId);
    if (staffId) await this.assertStaff(staffId);
    const updated = await (this.prisma as any).commission.update({ where: { id: commissionId }, data: { status: "PAID", paidAt: new Date() } });
    await this.audit?.record(staffId ? { id: staffId } : null, "COMMISSION_PAID", { type: "Commission", id: commissionId });
    return updated;
  }

  async waive(commissionId: string, staffId?: string) { return this.setState(commissionId, "WAIVED", staffId, "COMMISSION_WAIVED"); }
  async dispute(commissionId: string, staffId?: string) { return this.setState(commissionId, "DISPUTED", staffId, "COMMISSION_DISPUTED"); }

  async listForAdmin() { return (this.prisma as any).commission.findMany?.({ include: { conversion: true, owner: true }, orderBy: { createdAt: "desc" } }) ?? []; }
  async listForOwner(ownerId: string) { return (this.prisma as any).commission.findMany?.({ where: { ownerId }, include: { conversion: true }, orderBy: { createdAt: "desc" } }) ?? []; }

  private async setState(commissionId: string, status: "WAIVED" | "DISPUTED", staffId: string | undefined, action: string) {
    await this.getCommission(commissionId);
    if (staffId) await this.assertStaff(staffId);
    const updated = await (this.prisma as any).commission.update({ where: { id: commissionId }, data: { status } });
    await this.audit?.record(staffId ? { id: staffId } : null, action, { type: "Commission", id: commissionId });
    return updated;
  }

  private async getCommission(id: string) {
    const commission = await (this.prisma as any).commission.findUnique({ where: { id } });
    if (!commission) throw new NotFoundException("Commission not found");
    return commission;
  }

  private percentage() {
    const configured = this.config.commissionPercentage ?? Number(process.env.BETNA_COMMISSION_PERCENTAGE ?? 10);
    if (!Number.isFinite(configured) || configured <= 0 || configured > 100) throw new BadRequestException("Commission percentage is invalid");
    return Math.round(configured * 100) / 100;
  }

  private async assertStaff(staffId: string) {
    const user = await (this.prisma as any).user?.findUnique?.({ where: { id: staffId }, include: { roles: { include: { role: true } } } });
    if (user && !user.roles?.some((entry: any) => ["ADMIN", "STAFF"].includes(entry.role?.name ?? entry.name))) throw new ForbiddenException("Staff access required");
  }
}
