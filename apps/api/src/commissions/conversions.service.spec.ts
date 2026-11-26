import { describe, expect, it, vi } from "vitest";
import { ConversionsService } from "./conversions.service";

describe("ConversionsService currency", () => {
  it("rejects a first payment in a currency different from the property country offering", async () => {
    const prisma = {
      inquiry: {
        findUnique: vi.fn().mockResolvedValue({
          id: "inquiry-1", status: "OWNER_CONFIRMED", mode: "SHORT_STAY",
          property: { ownerId: "owner-1", country: { currency: "UGX" }, offerings: [{ mode: "SHORT_STAY", currency: "UGX" }] },
          conversion: null,
        }),
      },
      conversion: { create: vi.fn(), findUnique: vi.fn() },
      $transaction: async (work: (tx: any) => Promise<unknown>) => work(prisma),
    };
    const service = new ConversionsService(prisma as never);
    await expect(service.report({ inquiryId: "inquiry-1", ownerId: "owner-1", firstPaymentAmount: "100", firstPaymentCurrency: "KES" })).rejects.toThrow(/UGX/);
    expect(prisma.conversion.create).not.toHaveBeenCalled();
  });
});
