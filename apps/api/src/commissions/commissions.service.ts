import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

type CommissionConfig = { commissionPercentage?: number | string };
type TerminalCommissionStatus = "PAID" | "WAIVED" | "DISPUTED";

const LEGAL_TRANSITIONS: Record<string, readonly string[]> = {
  CONFIRMED: ["COMMISSION_DUE"],
  COMMISSION_DUE: ["PAID", "WAIVED", "DISPUTED"],
  PAID: [],
  WAIVED: [],
  DISPUTED: [],
};

@Injectable()
export class CommissionsService {
  private readonly config: CommissionConfig;
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly audit?: AuditService;

  constructor(private readonly prisma: PrismaService, @Optional() auditOrConfig?: AuditService | CommissionConfig, @Optional() config?: CommissionConfig) {
    this.audit = auditOrConfig && "record" in (auditOrConfig as any) ? auditOrConfig as AuditService : undefined;
    this.config = config ?? (auditOrConfig && !("record" in (auditOrConfig as any)) ? auditOrConfig as CommissionConfig : {});
  }

  async markDue(conversionId: string, staffId: string) {
    if (!conversionId) throw new BadRequestException("Conversion is required");
    await this.assertStaff(staffId);
    return this.withLock(`conversion:${conversionId}`, async () => {
      let commission: any;
      try {
        commission = await this.withTransaction(async (tx: any) => {
          if (typeof tx.$queryRaw === "function") await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Conversion" WHERE "id" = ${conversionId} FOR UPDATE`);
          const conversion = await tx.conversion.findUnique({ where: { id: conversionId }, include: { commission: true } });
          if (!conversion) throw new NotFoundException("Conversion not found");
          const existingCommission = conversion.commission ?? await tx.commission.findUnique?.({ where: { conversionId } });
          if (existingCommission) {
            if (["COMMISSION_DUE", "PAID"].includes(existingCommission.status)) return existingCommission;
            if (["WAIVED", "DISPUTED"].includes(existingCommission.status)) throw new ConflictException(`Illegal commission transition from ${existingCommission.status}`);
          }
          if (conversion.status !== "VERIFIED" || !conversion.verifiedAt || !conversion.verifiedBy || !conversion.paymentEvidence || conversion.firstPaymentAmount == null || !conversion.firstPaymentCurrency) {
            throw new ConflictException("Commission requires staff-verified first-payment evidence");
          }
          const percentage = this.percentage();
          const firstPaymentAmount = this.money(conversion.firstPaymentAmount, "First payment amount");
          const amountDue = firstPaymentAmount.times(percentage).dividedBy(100).toDecimalPlaces(2);
          if (!amountDue.gt(0)) throw new BadRequestException("Commission amount is invalid");
          const existing = existingCommission;
          if (existing?.status === "CONFIRMED") {
            const data = { status: "COMMISSION_DUE", percentage, firstPaymentAmount, amountDue, currency: conversion.firstPaymentCurrency, evidence: conversion.paymentEvidence };
            if (tx.commission.updateMany) {
              const result = await tx.commission.updateMany({ where: { id: existing.id, status: "CONFIRMED" }, data });
              if (result.count !== 1) {
                const current = await tx.commission.findUnique({ where: { id: existing.id } });
                if (current?.status === "COMMISSION_DUE" || current?.status === "PAID") return current;
                throw new ConflictException("Commission was changed by another reviewer");
              }
              const updated = await tx.commission.findUnique({ where: { id: existing.id } });
              await this.recordAudit(tx, { id: staffId }, "COMMISSION_MARKED_DUE", {
                type: "Commission",
                id: updated.id,
                metadata: { conversionId, percentage: updated.percentage },
              });
              return updated;
            }
            const updated = await tx.commission.update({ where: { id: existing.id }, data });
            await this.recordAudit(tx, { id: staffId }, "COMMISSION_MARKED_DUE", {
              type: "Commission",
              id: updated.id,
              metadata: { conversionId, percentage: updated.percentage },
            });
            return updated;
          }
          const created = await tx.commission.create({ data: {
            conversionId,
            ownerId: conversion.ownerId,
            status: "COMMISSION_DUE",
            percentage,
            firstPaymentAmount,
            amountDue,
            currency: conversion.firstPaymentCurrency,
            evidence: conversion.paymentEvidence,
          } });
          await this.recordAudit(tx, { id: staffId }, "COMMISSION_MARKED_DUE", {
            type: "Commission",
            id: created.id,
            metadata: { conversionId, percentage: created.percentage },
          });
          return created;
        });
      } catch (error: any) {
        if (error?.code !== "P2002") throw error;
        commission = await (this.prisma as any).commission.findUnique({ where: { conversionId } });
        if (!commission) throw error;
        if (!["COMMISSION_DUE", "PAID"].includes(commission.status)) throw new ConflictException(`Illegal commission transition from ${commission.status}`);
      }
      return commission;
    });
  }

  async markPaid(commissionId: string, staffId: string) {
    return this.transition(commissionId, staffId, "PAID", "COMMISSION_PAID", { paidAt: new Date() });
  }

  async waive(commissionId: string, staffId: string) {
    return this.transition(commissionId, staffId, "WAIVED", "COMMISSION_WAIVED");
  }

  async dispute(commissionId: string, staffId: string) {
    return this.transition(commissionId, staffId, "DISPUTED", "COMMISSION_DISPUTED");
  }

  async listForAdmin(staffId: string) {
    await this.assertStaff(staffId);
    return (this.prisma as any).commission.findMany?.({ include: { conversion: true, owner: true }, orderBy: { createdAt: "desc" } }) ?? [];
  }
  async listForOwner(ownerId: string) { return (this.prisma as any).commission.findMany?.({ where: { ownerId }, include: { conversion: true }, orderBy: { createdAt: "desc" } }) ?? []; }

  private async transition(commissionId: string, staffId: string, next: TerminalCommissionStatus, action: string, extra: Record<string, unknown> = {}) {
    if (!commissionId) throw new BadRequestException("Commission is required");
    await this.assertStaff(staffId);
    return this.withLock(`commission:${commissionId}`, async () => {
      const updated = await this.withTransaction(async (tx: any) => {
        if (typeof tx.$queryRaw === "function") await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Commission" WHERE "id" = ${commissionId} FOR UPDATE`);
        const commission = await tx.commission.findUnique({ where: { id: commissionId } });
        if (!commission) throw new NotFoundException("Commission not found");
        if (commission.status === next) return commission;
        if (!this.canTransition(commission.status, next)) throw new ConflictException(`Illegal commission transition from ${commission.status} to ${next}`);
        const data = { status: next, ...extra };
        if (tx.commission.updateMany) {
          const result = await tx.commission.updateMany({ where: { id: commissionId, status: commission.status }, data });
          if (result.count !== 1) {
            const current = await tx.commission.findUnique({ where: { id: commissionId } });
            if (current?.status === next) return current;
            throw new ConflictException(`Illegal commission transition to ${next}`);
          }
          const updated = await tx.commission.findUnique({ where: { id: commissionId } });
          await this.recordAudit(tx, { id: staffId }, action, { type: "Commission", id: commissionId });
          return updated;
        }
        const updated = await tx.commission.update({ where: { id: commissionId }, data });
        await this.recordAudit(tx, { id: staffId }, action, { type: "Commission", id: commissionId });
        return updated;
      });
      return updated;
    });
  }

  private canTransition(from: string, to: string) { return LEGAL_TRANSITIONS[from]?.includes(to) ?? false; }

  private async assertStaff(staffId: string) {
    if (!staffId?.trim()) throw new ForbiddenException("Staff access required");
    const user = await (this.prisma as any).user?.findUnique?.({ where: { id: staffId }, include: { roles: { include: { role: true } } } });
    const roles = user?.roles?.map((entry: any) => String(entry?.role?.name ?? entry?.name ?? "").toUpperCase()) ?? [];
    if (!user || user.status !== "ACTIVE" || !roles.some((role: string) => ["ADMIN", "STAFF"].includes(role))) throw new ForbiddenException("Staff access required");
  }

  private percentage() {
    const configured = this.config.commissionPercentage ?? process.env.BETNA_COMMISSION_PERCENTAGE ?? "10";
    const percentage = this.money(configured, "Commission percentage");
    if (!percentage.gt(0) || percentage.gt(100)) throw new BadRequestException("Commission percentage is invalid");
    return percentage;
  }

  private money(value: unknown, label: string) {
    if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Prisma.Decimal)) throw new BadRequestException(`${label} must be a valid decimal`);
    try {
      const amount = new Prisma.Decimal(value as any).toDecimalPlaces(2);
      if (!amount.isFinite()) throw new Error("non-finite");
      return amount;
    } catch {
      throw new BadRequestException(`${label} must be a valid decimal`);
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
}
