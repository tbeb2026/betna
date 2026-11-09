import { describe, expect, it, vi } from "vitest";
import { InternalServerErrorException, NotFoundException } from "@nestjs/common";
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
      auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit-release" }) },
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

  it("audits an exact location returned by an idempotent release", async () => {
    const inquiry: any = {
      id: "inquiry-idempotent",
      status: "LOCATION_APPROVED",
      reference: "BTN-IDEMPOTENT",
      locationReleaseId: "release-idempotent",
      locationApprovedAt: new Date("2026-11-09T08:00:00.000Z"),
      locationReleaseExpiresAt: new Date(Date.now() + 60_000),
      property: { exactAddress: "Private lane", exactLatitude: -1.2, exactLongitude: 36.8 },
    };
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit-view" });
    const prisma: any = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(async (work: any) => work(prisma)),
      inquiry: { findUnique: vi.fn(async () => inquiry) },
      auditEvent: { create: auditCreate },
    };
    const service = new LocationReleaseService(prisma);

    const result = await service.release("inquiry-idempotent", { id: "admin", roles: ["ADMIN"] });

    expect(result).toMatchObject({ idempotent: true, location: { exactAddress: "Private lane" } });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "EXACT_LOCATION_VIEWED",
        entityId: "inquiry-idempotent",
      }),
    }));
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain(
      "release-idempotent",
    );
  });

  it("audits an exact location returned after a concurrent release claim loses its race", async () => {
    const approved: any = {
      id: "inquiry-claimed",
      status: "LOCATION_APPROVED",
      reference: "BTN-CLAIMED",
      locationReleaseId: "release-claimed",
      locationApprovedAt: new Date("2026-11-09T08:00:00.000Z"),
      locationReleaseExpiresAt: new Date(Date.now() + 60_000),
      property: { exactAddress: "Private lane", exactLatitude: -1.2, exactLongitude: 36.8 },
    };
    const inquiry: any = {
      ...approved,
      status: "NEW",
      locationReleaseId: null,
      locationApprovedAt: null,
    };
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit-view" });
    const findUnique = vi.fn()
      .mockResolvedValueOnce(inquiry)
      .mockResolvedValueOnce(approved);
    const prisma: any = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(async (work: any) => work(prisma)),
      inquiry: {
        findUnique,
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      auditEvent: { create: auditCreate },
    };
    const service = new LocationReleaseService(prisma);

    const result = await service.release("inquiry-claimed", { id: "admin", roles: ["ADMIN"] });

    expect(result).toMatchObject({ idempotent: true, location: { exactAddress: "Private lane" } });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "EXACT_LOCATION_VIEWED", entityId: "inquiry-claimed" }),
    }));
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain(
      "release-claimed",
    );
  });

  it("revalidates a token after locking when a concurrent revoke commits first", async () => {
    const inquiry: any = {
      id: "inquiry-token-race",
      status: "LOCATION_APPROVED",
      reference: "BTN-TOKEN-RACE",
      locationReleaseId: "11111111-1111-4111-8111-111111111111",
      locationApprovedAt: new Date("2026-11-09T08:00:00.000Z"),
      locationReleaseExpiresAt: new Date(Date.now() + 60_000),
      locationRevokedAt: null,
      property: { exactAddress: "Private lane", exactLatitude: -1.2, exactLongitude: 36.8 },
    };
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
    const serviceRef: { current?: LocationReleaseService } = {};
    let revoking = false;
    const queryRaw = vi.fn(async () => {
      if (revoking) return [];
      revoking = true;
      await serviceRef.current!.revoke(inquiry.id, { id: "admin", roles: ["ADMIN"] }, "Concurrent revoke");
      return [];
    });
    const findUnique = vi.fn(async ({ where }: any) => {
      if (where.locationReleaseId) {
        return inquiry.status === "LOCATION_APPROVED"
          ? { ...inquiry, property: { ...inquiry.property } }
          : null;
      }
      return { ...inquiry, property: { ...inquiry.property } };
    });
    const prisma: any = {
      $queryRaw: queryRaw,
      $transaction: vi.fn(async (work: any) => work(prisma)),
      inquiry: {
        findUnique,
        updateMany: vi.fn(async ({ data }: any) => {
          Object.assign(inquiry, data);
          return { count: 1 };
        }),
      },
      auditEvent: { create: auditCreate },
    };
    const service = new LocationReleaseService(prisma);
    serviceRef.current = service;

    await expect(service.getReleasedLocationByToken(inquiry.locationReleaseId)).rejects.toBeInstanceOf(NotFoundException);
    expect(auditCreate.mock.calls.some(([call]) => call.data.action === "EXACT_LOCATION_VIEWED")).toBe(false);
    expect(inquiry.status).toBe("CONTACTED");
  });

  it("fails closed when token-location audit persistence is unavailable", async () => {
    const token = "22222222-2222-4222-8222-222222222222";
    const inquiry: any = {
      id: "inquiry-no-audit",
      status: "LOCATION_APPROVED",
      reference: "BTN-NO-AUDIT",
      locationReleaseId: token,
      locationReleaseExpiresAt: new Date(Date.now() + 60_000),
      locationRevokedAt: null,
      property: { exactAddress: "Private lane", exactLatitude: -1.2, exactLongitude: 36.8 },
    };
    const prisma: any = {
      $transaction: vi.fn(async (work: any) => work(prisma)),
      inquiry: { findUnique: vi.fn(async () => ({ ...inquiry, property: { ...inquiry.property } })) },
    };
    const service = new LocationReleaseService(prisma);

    await expect(service.getReleasedLocationByToken(token)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it("fails closed when token-location audit persistence fails", async () => {
    const token = "33333333-3333-4333-8333-333333333333";
    const inquiry: any = {
      id: "inquiry-failing-audit",
      status: "LOCATION_APPROVED",
      reference: "BTN-FAILING-AUDIT",
      locationReleaseId: token,
      locationReleaseExpiresAt: new Date(Date.now() + 60_000),
      locationRevokedAt: null,
      property: { exactAddress: "Private lane", exactLatitude: -1.2, exactLongitude: 36.8 },
    };
    const prisma: any = {
      $transaction: vi.fn(async (work: any) => work(prisma)),
      inquiry: {
        findUnique: vi.fn(async () => ({ ...inquiry, property: { ...inquiry.property } })),
      },
      auditEvent: { create: vi.fn().mockRejectedValue(new Error("audit store unavailable")) },
    };
    const service = new LocationReleaseService(prisma);

    await expect(service.getReleasedLocationByToken(token)).rejects.toThrow("audit store unavailable");
  });

  it("does not persist visitor redemption tokens in audit metadata", async () => {
    const token = "44444444-4444-4444-8444-444444444444";
    const inquiry: any = {
      id: "inquiry-visitor-audit",
      status: "LOCATION_APPROVED",
      reference: "BTN-VISITOR-AUDIT",
      locationReleaseId: token,
      locationReleaseExpiresAt: new Date(Date.now() + 60_000),
      locationRevokedAt: null,
      property: { exactAddress: "Private lane", exactLatitude: -1.2, exactLongitude: 36.8 },
    };
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit-visitor" });
    const prisma: any = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(async (work: any) => work(prisma)),
      inquiry: { findUnique: vi.fn(async () => ({ ...inquiry, property: { ...inquiry.property } })) },
      auditEvent: { create: auditCreate },
    };
    const service = new LocationReleaseService(prisma);

    await service.getReleasedLocationByToken(token);

    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "EXACT_LOCATION_VIEWED",
        entityId: inquiry.id,
        metadata: { channel: "visitor-token" },
      }),
    }));
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain(token);
  });
});
