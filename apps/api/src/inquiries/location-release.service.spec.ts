import { describe, expect, it, vi } from "vitest";
import { LocationReleaseService } from "./location-release.service";
import { AuditService } from "../audit/audit.service";

describe("LocationReleaseService", () => {
  it("takes a database row lock so release and revoke coordinate across instances", async () => {
    const inquiry: any = {
      id: "inquiry-lock",
      status: "NEW",
      reference: "BTN-LOCK",
      property: { exactAddress: "Private lane", exactLatitude: -1.2, exactLongitude: 36.8 },
    };
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma: any = {
      $queryRaw: queryRaw,
      $transaction: vi.fn(async (work: any) => work(prisma)),
      inquiry: {
        findUnique: vi.fn(async () => inquiry),
        updateMany: vi.fn(async ({ data }: any) => {
          Object.assign(inquiry, data);
          return { count: 1 };
        }),
      },
    };
    const service = new LocationReleaseService(prisma);

    await service.release("inquiry-lock", { id: "admin", roles: ["ADMIN"] });

    const sql = queryRaw.mock.calls.map(([query]) => query?.strings?.join(" ") ?? String(query)).join(" ");
    expect(sql).toContain("FOR UPDATE");
  });

  it("does not commit a release when its audit side effect fails", async () => {
    const inquiry: any = {
      id: "inquiry-audit",
      status: "NEW",
      reference: "BTN-AUDIT",
      property: { exactAddress: "Private lane", exactLatitude: -1.2, exactLongitude: 36.8 },
    };
    const auditCreate = vi.fn().mockRejectedValue(new Error("audit store unavailable"));
    const prisma: any = {
      inquiry: {
        findUnique: vi.fn(async () => inquiry),
        updateMany: vi.fn(async ({ data }: any) => { Object.assign(inquiry, data); return { count: 1 }; }),
      },
    };
    prisma.$transaction = vi.fn(async (work: any) => {
      const txInquiry = { ...inquiry };
      const tx: any = {
        ...prisma,
        inquiry: {
          findUnique: vi.fn(async () => txInquiry),
          updateMany: vi.fn(async ({ data }: any) => { Object.assign(txInquiry, data); return { count: 1 }; }),
        },
        auditEvent: { create: auditCreate },
      };
      return work(tx);
    });
    const audit = new AuditService({ auditEvent: { create: vi.fn() } } as any);
    const service = new LocationReleaseService(prisma, audit);

    await expect(service.release("inquiry-audit", { id: "admin", roles: ["ADMIN"] })).rejects.toThrow("audit store unavailable");
    expect(inquiry.status).toBe("NEW");
    expect(auditCreate).toHaveBeenCalled();
  });
});
