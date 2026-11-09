import { describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { CommissionsService } from "./commissions.service";
import { ConversionsService } from "./conversions.service";

function makePrisma() {
  const conversions: any[] = [];
  const commissions: any[] = [];
  const inquiries = [{
    id: "inquiry-1",
    status: "OWNER_CONFIRMED",
    propertyId: "property-1",
    property: { ownerId: "owner-1" },
  }];
  const prisma: any = {
    inquiry: { findUnique: vi.fn(async ({ where }: any) => inquiries.find((row) => row.id === where.id) ?? null) },
    conversion: {
      findUnique: vi.fn(async ({ where }: any) => conversions.find((row) => row.id === where.id || row.inquiryId === where.inquiryId) ?? null),
      create: vi.fn(async ({ data }: any) => { const row = { id: `conversion-${conversions.length + 1}`, ...data }; conversions.push(row); return row; }),
      update: vi.fn(async ({ where, data }: any) => { const row = conversions.find((candidate) => candidate.id === where.id); Object.assign(row, data); return row; }),
    },
    commission: {
      create: vi.fn(async ({ data }: any) => { const row = { id: `commission-${commissions.length + 1}`, ...data }; commissions.push(row); return row; }),
      update: vi.fn(async ({ where, data }: any) => { const row = commissions.find((candidate) => candidate.id === where.id); Object.assign(row, data); return row; }),
      findUnique: vi.fn(async ({ where }: any) => commissions.find((row) => row.id === where.id || row.conversionId === where.conversionId) ?? null),
    },
    user: {
      findUnique: vi.fn(async ({ where }: any) => where.id === "staff-1" ? { id: "staff-1", status: "ACTIVE", roles: [{ role: { name: "ADMIN" } }] } : null),
    },
    $transaction: vi.fn(async (work: any) => work(prisma)),
  };
  return { prisma, conversions, commissions };
}

describe("ConversionsService and CommissionsService", () => {
  it("rolls back a reported conversion when its audit write fails", async () => {
    const { prisma, conversions } = makePrisma();
    const before = structuredClone(conversions);
    const audit = { record: vi.fn().mockRejectedValue(new Error("audit unavailable")) };
    prisma.$transaction = vi.fn(async (work: any) => {
      try {
        return await work(prisma);
      } catch (error) {
        conversions.splice(0, conversions.length, ...before);
        throw error;
      }
    });
    const service = new ConversionsService(prisma, audit as any);

    await expect(service.report({
      inquiryId: "inquiry-1",
      ownerId: "owner-1",
      firstPaymentAmount: 800,
      firstPaymentCurrency: "KES",
      paymentEvidence: "receipt-ref-1",
    })).rejects.toThrow("audit unavailable");
    expect(conversions).toEqual([]);
    expect(audit.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ action: "CONVERSION_REPORTED" }),
    );
  });

  it("rolls back a commission transition when its audit write fails", async () => {
    const { prisma, conversions, commissions } = makePrisma();
    const conversionsService = new ConversionsService(prisma);
    const reported = await conversionsService.report({
      inquiryId: "inquiry-1",
      ownerId: "owner-1",
      firstPaymentAmount: 800,
      firstPaymentCurrency: "KES",
      paymentEvidence: "receipt-ref-1",
    });
    await conversionsService.verifyEvidence(reported.id, "staff-1", {
      paymentEvidence: "staff-checked-receipt-1",
    });
    const before = structuredClone(commissions);
    const audit = { record: vi.fn().mockRejectedValue(new Error("audit unavailable")) };
    prisma.$transaction = vi.fn(async (work: any) => {
      try {
        return await work(prisma);
      } catch (error) {
        commissions.splice(0, commissions.length, ...before);
        throw error;
      }
    });
    const service = new CommissionsService(prisma, audit as any, { commissionPercentage: 12.5 });

    await expect(service.markDue(reported.id, "staff-1")).rejects.toThrow("audit unavailable");
    expect(commissions).toEqual(before);
    expect(audit.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ action: "COMMISSION_MARKED_DUE" }),
    );
    expect(conversions).toHaveLength(1);
  });

  it("reports a conversion, verifies payment evidence, and snapshots the configured commission percentage", async () => {
    const { prisma, conversions, commissions } = makePrisma();
    const conversionsService = new ConversionsService(prisma);
    const commissionsService = new CommissionsService(prisma, undefined, { commissionPercentage: 12.5 });

    const reported = await conversionsService.report({
      inquiryId: "inquiry-1",
      ownerId: "owner-1",
      firstPaymentAmount: 800,
      firstPaymentCurrency: "KES",
      paymentEvidence: "receipt-ref-1",
    });
    expect(reported).toMatchObject({ status: "EVIDENCE_PENDING", inquiryId: "inquiry-1" });
    expect(commissions).toHaveLength(0);

    const verified = await conversionsService.verifyEvidence(reported.id, "staff-1", {
      paymentEvidence: "staff-checked-receipt-1",
    });
    expect(verified).toMatchObject({ status: "VERIFIED", verifiedBy: "staff-1" });

    const due = await commissionsService.markDue(reported.id, "staff-1");
    expect(due).toMatchObject({ status: "COMMISSION_DUE", currency: "KES" });
    expect(due.percentage.toFixed(2)).toBe("12.50");
    expect(due.amountDue.toFixed(2)).toBe("100.00");
    expect(conversions).toHaveLength(1);
    expect(commissions).toHaveLength(1);
  });

  it("rejects markDue when staff has not verified first-payment evidence", async () => {
    const { prisma } = makePrisma();
    const conversionsService = new ConversionsService(prisma);
    const commissionsService = new CommissionsService(prisma);
    const reported = await conversionsService.report({
      inquiryId: "inquiry-1",
      ownerId: "owner-1",
      firstPaymentAmount: 800,
      firstPaymentCurrency: "KES",
      paymentEvidence: "owner-assertion",
    });

    await expect(commissionsService.markDue(reported.id, "staff-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects commission actions for an unknown staff identity", async () => {
    const { prisma } = makePrisma();
    const conversionsService = new ConversionsService(prisma);
    const reported = await conversionsService.report({
      inquiryId: "inquiry-1",
      ownerId: "owner-1",
      firstPaymentAmount: "800.00",
      firstPaymentCurrency: "KES",
      paymentEvidence: "receipt",
    });

    await expect(conversionsService.verifyEvidence(reported.id, "missing-staff", { paymentEvidence: "checked" }))
      .rejects.toThrow(/staff/i);
  });

  it("keeps terminal commission states immutable and idempotent", async () => {
    const { prisma } = makePrisma();
    const conversionsService = new ConversionsService(prisma);
    const commissionsService = new CommissionsService(prisma, undefined, { commissionPercentage: 12.5 });
    const reported = await conversionsService.report({
      inquiryId: "inquiry-1",
      ownerId: "owner-1",
      firstPaymentAmount: "800.00",
      firstPaymentCurrency: "KES",
      paymentEvidence: "receipt",
    });
    await conversionsService.verifyEvidence(reported.id, "staff-1", { paymentEvidence: "checked" });
    const due = await commissionsService.markDue(reported.id, "staff-1");
    const paid = await commissionsService.markPaid(due.id, "staff-1");
    await expect(commissionsService.waive(due.id, "staff-1")).rejects.toThrow(/transition/i);
    await expect(commissionsService.markPaid(due.id, "staff-1")).resolves.toMatchObject({ status: "PAID" });
    expect(paid.status).toBe("PAID");
  });

  it("returns one due commission when markDue races on a unique conversion", async () => {
    const { prisma, commissions } = makePrisma();
    const conversionsService = new ConversionsService(prisma);
    const commissionsService = new CommissionsService(prisma, undefined, { commissionPercentage: 12.5 });
    const reported = await conversionsService.report({
      inquiryId: "inquiry-1",
      ownerId: "owner-1",
      firstPaymentAmount: "800.00",
      firstPaymentCurrency: "KES",
      paymentEvidence: "receipt",
    });
    await conversionsService.verifyEvidence(reported.id, "staff-1", { paymentEvidence: "checked" });
    const results = await Promise.all([
      commissionsService.markDue(reported.id, "staff-1"),
      commissionsService.markDue(reported.id, "staff-1"),
    ]);
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(commissions).toHaveLength(1);
  });

  it("reports one conversion when duplicate owner submissions race", async () => {
    const { prisma, conversions } = makePrisma();
    const service = new ConversionsService(prisma);
    const input = {
      inquiryId: "inquiry-1",
      ownerId: "owner-1",
      firstPaymentAmount: "800.009",
      firstPaymentCurrency: "KES",
      paymentEvidence: "receipt",
    };
    const [first, second] = await Promise.all([service.report(input), service.report(input)]);
    expect(first.id).toBe(second.id);
    expect(conversions).toHaveLength(1);
    expect(conversions[0].firstPaymentAmount.toFixed(2)).toBe("800.01");
  });
});
