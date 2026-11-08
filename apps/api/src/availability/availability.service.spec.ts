import { describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { AvailabilityService } from "./availability.service";

function makePrisma() {
  const inquiries: any[] = [
    {
      id: "inquiry-winner",
      propertyId: "property-1",
      status: "NEW",
      startDate: new Date("2026-12-10T00:00:00.000Z"),
      endDate: new Date("2026-12-14T00:00:00.000Z"),
      property: { id: "property-1", ownerId: "owner-1" },
      offering: { mode: "SHORT_STAY" },
    },
    {
      id: "inquiry-overlap",
      propertyId: "property-1",
      status: "CONTACTED",
      startDate: new Date("2026-12-12T00:00:00.000Z"),
      endDate: new Date("2026-12-16T00:00:00.000Z"),
      property: { id: "property-1", ownerId: "owner-1" },
      offering: { mode: "SHORT_STAY" },
    },
    {
      id: "inquiry-disjoint",
      propertyId: "property-1",
      status: "NEW",
      startDate: new Date("2026-12-20T00:00:00.000Z"),
      endDate: new Date("2026-12-22T00:00:00.000Z"),
      property: { id: "property-1", ownerId: "owner-1" },
      offering: { mode: "SHORT_STAY" },
    },
  ];
  const blocks: any[] = [];
  const prisma: any = {
    inquiry: {
      findUnique: vi.fn(async ({ where }: any) => inquiries.find((row) => row.id === where.id) ?? null),
      findMany: vi.fn(async ({ where }: any) => inquiries.filter((row) => {
        if (where?.propertyId && row.propertyId !== where.propertyId) return false;
        if (where?.id?.not && row.id === where.id.not) return false;
        return ["NEW", "CONTACTED", "LOCATION_APPROVED"].includes(row.status);
      })),
      update: vi.fn(async ({ where, data }: any) => {
        const row = inquiries.find((candidate) => candidate.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = inquiries.filter((row) => {
          if (where?.propertyId && row.propertyId !== where.propertyId) return false;
          if (where?.id && where.id !== row.id && !where.id.not) return false;
          if (where?.id?.not && row.id === where.id.not) return false;
          if (where?.status?.in && !where.status.in.includes(row.status)) return false;
          return true;
        });
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      }),
    },
    availabilityBlock: {
      create: vi.fn(async ({ data }: any) => {
        const block = { id: `block-${blocks.length + 1}`, ...data };
        blocks.push(block);
        return block;
      }),
      findMany: vi.fn(async () => blocks),
    },
    $transaction: vi.fn(async (work: any) => work(prisma)),
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return { prisma, inquiries, blocks };
}

describe("AvailabilityService", () => {
  it("atomically blocks confirmed dates and declines overlapping pending inquiries", async () => {
    const { prisma, inquiries, blocks } = makePrisma();
    const service = new AvailabilityService(prisma);

    const result = await service.confirmInquiryAndBlockDates("inquiry-winner", "owner-1");

    expect(result).toMatchObject({ inquiry: { id: "inquiry-winner", status: "OWNER_CONFIRMED" } });
    expect(blocks).toHaveLength(1);
    expect(inquiries.find((row) => row.id === "inquiry-overlap")?.status).toBe("OWNER_DECLINED");
    expect(inquiries.find((row) => row.id === "inquiry-disjoint")?.status).toBe("NEW");
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it("rejects a confirmation when the requested dates are already blocked", async () => {
    const { prisma } = makePrisma();
    prisma.availabilityBlock.findMany.mockResolvedValueOnce([
      { propertyId: "property-1", startDate: new Date("2026-12-09"), endDate: new Date("2026-12-15") },
    ]);
    const service = new AvailabilityService(prisma);

    await expect(service.confirmInquiryAndBlockDates("inquiry-winner", "owner-1"))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
