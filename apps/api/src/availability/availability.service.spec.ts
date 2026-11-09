import { describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { AvailabilityService } from "./availability.service";
import { AuditService } from "../audit/audit.service";

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
    {
      id: "inquiry-legacy-overlap",
      propertyId: "property-1",
      status: "NEW",
      mode: "SHORT_STAY",
      startDate: new Date("2026-12-11T00:00:00.000Z"),
      endDate: new Date("2026-12-12T00:00:00.000Z"),
      reference: "BTNA-LEGACY",
      guestEmail: "legacy@example.com",
      guestPhone: "+254700000009",
      property: { id: "property-1", ownerId: "owner-1" },
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
  it("rejects confirmation when owner unavailable dates overlap the requested stay", async () => {
    const { prisma, blocks } = makePrisma();
    prisma.unavailableDate = {
      findMany: vi.fn().mockResolvedValue([
        {
          propertyId: "property-1",
          startDate: new Date("2026-12-09"),
          endDate: new Date("2026-12-15"),
        },
      ]),
    };
    const service = new AvailabilityService(prisma);

    await expect(service.confirmInquiryAndBlockDates("inquiry-winner", "owner-1"))
      .rejects.toBeInstanceOf(ConflictException);
    expect(blocks).toHaveLength(0);
  });

  it("rolls back inquiry and block state when an audit write fails", async () => {
    const { prisma, inquiries, blocks } = makePrisma();
    const auditCreate = vi.fn().mockRejectedValue(new Error("audit unavailable"));
    let transactionClient: any;
    prisma.$transaction = vi.fn(async (work: any) => {
      // This fake has the same commit boundary as Prisma: work runs against a
      // private transaction client and is copied into committed state only if
      // every tx operation succeeds. A failed audit leaves the committed arrays
      // untouched without test-side restoration.
      const txState = makePrisma();
      txState.inquiries.splice(0, txState.inquiries.length, ...structuredClone(inquiries));
      txState.blocks.splice(0, txState.blocks.length, ...structuredClone(blocks));
      transactionClient = txState.prisma;
      transactionClient.auditEvent = { create: auditCreate };
      const result = await work(transactionClient);
      inquiries.splice(0, inquiries.length, ...txState.inquiries);
      blocks.splice(0, blocks.length, ...txState.blocks);
      return result;
    });
    const audit = new AuditService({ auditEvent: { create: vi.fn() } } as any);
    const service = new AvailabilityService(prisma, audit);

    await expect(service.confirmInquiryAndBlockDates("inquiry-winner", "owner-1"))
      .rejects.toThrow("audit unavailable");
    expect(inquiries.find((row) => row.id === "inquiry-winner")?.status).toBe("NEW");
    expect(inquiries.find((row) => row.id === "inquiry-overlap")?.status).toBe("CONTACTED");
    expect(blocks).toHaveLength(0);
    expect(auditCreate).toHaveBeenCalled();
    expect(transactionClient).not.toBe(prisma);
  });

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

  it("uses date-bearing legacy inquiries as short-stay overlaps and notifies auto-declines", async () => {
    const { prisma, inquiries } = makePrisma();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new AvailabilityService(prisma, undefined, { enqueue } as any);

    await service.confirmInquiryAndBlockDates("inquiry-winner", "owner-1");

    expect(inquiries.find((row) => row.id === "inquiry-legacy-overlap")?.status).toBe("OWNER_DECLINED");
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      type: "INQUIRY_AUTO_DECLINED_OVERLAP",
      inquiryId: "inquiry-legacy-overlap",
    }));
  });

  it("locks the property and inquiry before declining and uses a guarded status update", async () => {
    const { prisma, inquiries } = makePrisma();
    const service = new AvailabilityService(prisma);

    await service.ownerDeclineInquiry("inquiry-winner", "owner-1");

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.inquiry.updateMany).toHaveBeenCalledWith({
      where: { id: "inquiry-winner", status: { in: ["NEW", "CONTACTED", "LOCATION_APPROVED"] } },
      data: { status: "OWNER_DECLINED" },
    });
    expect(inquiries.find((row) => row.id === "inquiry-winner")?.status).toBe("OWNER_DECLINED");
  });

  it("authorizes unavailable-date writes after the property lock", async () => {
    const property = { id: "property-1", ownerId: "owner-1" };
    const unavailable: any[] = [];
    const prisma: any = {
      property: {
        findFirst: vi.fn(async ({ where }: any) => property.id === where.id && property.ownerId === where.ownerId ? property : null),
        findUnique: vi.fn(async ({ where }: any) => property.id === where.id ? property : null),
      },
      unavailableDate: {
        create: vi.fn(async ({ data }: any) => { const row = { id: "unavailable-1", ...data }; unavailable.push(row); return row; }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(async (work: any) => work(prisma)),
      $queryRaw: vi.fn(async () => { property.ownerId = "owner-2"; return []; }),
    };
    const service = new AvailabilityService(prisma);

    await expect(service.createUnavailableDate("owner-1", {
      propertyId: "property-1",
      startDate: "2026-12-20",
      endDate: "2026-12-22",
    })).rejects.toThrow(/property owner/i);
    expect(unavailable).toHaveLength(0);
  });
});
