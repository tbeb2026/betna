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
    $transaction: vi.fn(async (work: any) => work(prisma)),
  };
  return { prisma, conversions, commissions };
}

describe("ConversionsService and CommissionsService", () => {
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

    const due = await commissionsService.markDue(reported.id);
    expect(due).toMatchObject({ status: "COMMISSION_DUE", percentage: 12.5, amountDue: 100, currency: "KES" });
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

    await expect(commissionsService.markDue(reported.id)).rejects.toBeInstanceOf(ConflictException);
  });
});
