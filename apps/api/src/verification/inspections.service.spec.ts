import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, BadRequestException } from "@nestjs/common";
import { InspectionsService } from "./inspections.service";

const inspection = {
  id: "inspection-1",
  propertyId: "property-1",
  territoryId: "territory-1",
  cityId: "city-1",
  verifierId: null,
  status: "DRAFT",
  checklist: {},
  notes: null,
  requiredEvidenceSynced: false,
  evidence: [],
  property: { category: "residential" },
};

function makePrisma() {
  const users = new Map<string, any>([
    ["admin-1", { id: "admin-1", roles: [{ role: { name: "ADMIN" } }] }],
    [
      "verifier-1",
      {
        id: "verifier-1",
        roles: [{ role: { name: "VERIFIER" } }],
        territoryAssignments: [{ territoryId: "territory-1" }],
      },
    ],
    [
      "verifier-2",
      {
        id: "verifier-2",
        roles: [{ role: { name: "VERIFIER" } }],
        territoryAssignments: [{ territoryId: "territory-2" }],
      },
    ],
  ]);
  const rows = new Map([[inspection.id, structuredClone(inspection)]]) as Map<
    string,
    any
  >;
  const prisma: any = {
    inspection: {
      findUnique: vi.fn(async ({ where }: any) => rows.get(where.id) ?? null),
      findFirst: vi.fn(async ({ where }: any) => {
        const row = rows.get(where.id);
        return row &&
          Object.entries(where).every(([key, value]) => row[key] === value)
          ? row
          : null;
      }),
      findMany: vi.fn(async ({ where }: any = {}) =>
        [...rows.values()].filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ),
      ),
      update: vi.fn(async ({ where, data, include }: any) => {
        const row = rows.get(where.id);
        Object.assign(row, data);
        return row;
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { ...inspection, ...data, evidence: [] };
        rows.set(row.id, row);
        return row;
      }),
    },
    user: {
      findUnique: vi.fn(
        async ({ where, include }: any) => users.get(where.id) ?? null,
      ),
    },
    property: {
      findUnique: vi.fn(async () => ({
        id: "property-1",
        category: "residential",
      })),
      update: vi.fn(async ({ data }: any) => ({ id: "property-1", ...data })),
    },
    media: {
      findMany: vi.fn(async () => []),
    },
  };
  return { prisma, rows };
}

const completeChecklist = {
  identityAuthorization: true,
  exactLocation: true,
  currentPhotos: true,
  statedPrice: true,
  category: true,
  safetyCondition: true,
  residentialUtilities: true,
};

describe("InspectionsService", () => {
  it("restricts assignments to a verifier assigned to the inspection territory", async () => {
    const { prisma } = makePrisma();
    const service = new InspectionsService(prisma);

    await expect(
      service.assign("inspection-1", "verifier-2", {
        id: "admin-1",
        roles: ["ADMIN"],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const assigned = await service.assign("inspection-1", "verifier-1", {
      id: "admin-1",
      roles: ["ADMIN"],
    });
    expect(assigned.verifierId).toBe("verifier-1");
  });

  it("requires the baseline and category checklist before submission can be reviewed", async () => {
    const { prisma } = makePrisma();
    const service = new InspectionsService(prisma);
    await service.assign("inspection-1", "verifier-1", {
      id: "admin-1",
      roles: ["ADMIN"],
    });

    await expect(
      service.submitPendingUpload("inspection-1", "verifier-1", {
        checklist: { identityAuthorization: true },
        evidence: [{ mediaId: "media-1" }],
      }),
    ).rejects.toThrow(/checklist/i);

    const pending = await service.submitPendingUpload(
      "inspection-1",
      "verifier-1",
      {
        checklist: completeChecklist,
        evidence: [{ mediaId: "media-1" }],
        notes: "Visited in person",
      },
    );
    expect(pending.status).toBe("PENDING_UPLOAD");
  });

  it("rejects admin approval while evidence is pending upload", async () => {
    const { prisma } = makePrisma();
    const service = new InspectionsService(prisma);
    await service.assign("inspection-1", "verifier-1", {
      id: "admin-1",
      roles: ["ADMIN"],
    });
    await service.submitPendingUpload("inspection-1", "verifier-1", {
      checklist: completeChecklist,
      evidence: [{ mediaId: "media-1" }],
    });

    await expect(
      service.adminReview(
        "inspection-1",
        { id: "admin-1", roles: ["ADMIN"] },
        "APPROVED",
      ),
    ).rejects.toThrow(/sync|ready/i);
  });

  it("retries an offline evidence upload and becomes ready after synchronization", async () => {
    const { prisma } = makePrisma();
    const service = new InspectionsService(prisma);
    await service.assign("inspection-1", "verifier-1", {
      id: "admin-1",
      roles: ["ADMIN"],
    });
    await service.submitPendingUpload("inspection-1", "verifier-1", {
      checklist: completeChecklist,
      evidence: [{ mediaId: "media-1" }],
    });

    await expect(
      service.markEvidenceSynced("inspection-1", "media-1", { ok: false }),
    ).rejects.toThrow(/sync/i);
    const ready = await service.markEvidenceSynced("inspection-1", "media-1", {
      ok: true,
    });
    expect(ready.status).toBe("READY_FOR_REVIEW");
    expect(ready.requiredEvidenceSynced).toBe(true);
  });

  it("keeps verifier listings restricted when no territory context is available", async () => {
    const { prisma } = makePrisma();
    prisma.inspection.findMany.mockImplementation(async ({ where }: any) => {
      if (where.territoryId?.in) {
        return where.territoryId.in.includes("territory-1")
          ? [{ ...inspection, verifierId: "verifier-1" }]
          : [];
      }
      return [{ ...inspection, verifierId: "verifier-1" }];
    });
    const service = new InspectionsService(prisma);

    const visible = await service.listForVerifier("verifier-1", []);

    expect(visible).toEqual([]);
    expect(prisma.inspection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ territoryId: { in: [] } }),
      }),
    );
  });

  it("does not allow an unrelated evidence item to complete synchronization", async () => {
    const { prisma } = makePrisma();
    const service = new InspectionsService(prisma);
    await service.assign("inspection-1", "verifier-1", {
      id: "admin-1",
      roles: ["ADMIN"],
    });
    await service.submitPendingUpload("inspection-1", "verifier-1", {
      checklist: completeChecklist,
      evidence: [{ mediaId: "media-1" }],
    });

    await expect(
      service.markEvidenceSynced("inspection-1", "media-2", { ok: true }),
    ).rejects.toThrow(/required evidence/i);
  });

  it("rejects synchronization for evidence media that does not exist", async () => {
    const { prisma } = makePrisma();
    prisma.media.findUnique = vi.fn(async () => null);
    const service = new InspectionsService(prisma);
    await service.assign("inspection-1", "verifier-1", {
      id: "admin-1",
      roles: ["ADMIN"],
    });
    await service.submitPendingUpload("inspection-1", "verifier-1", {
      checklist: completeChecklist,
      evidence: [{ mediaId: "media-1" }],
    });

    await expect(
      service.markEvidenceSynced("inspection-1", "media-1", { ok: true }),
    ).rejects.toThrow(/media.*not found/i);
  });

  it("restricts evidence synchronization to the assigned verifier", async () => {
    const { prisma } = makePrisma();
    prisma.media.findUnique = vi.fn(async () => ({
      id: "media-1",
      purpose: "INSPECTION_EVIDENCE",
      status: "CLEAN",
      propertyId: "property-1",
    }));
    const service = new InspectionsService(prisma);
    await service.assign("inspection-1", "verifier-1", {
      id: "admin-1",
      roles: ["ADMIN"],
    });
    await service.submitPendingUpload("inspection-1", "verifier-1", {
      checklist: completeChecklist,
      evidence: [{ mediaId: "media-1" }],
    });

    await expect(
      service.markEvidenceSynced(
        "inspection-1",
        "media-1",
        { ok: true },
        "verifier-2",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects an invalid admin review decision", async () => {
    const { prisma } = makePrisma();
    const service = new InspectionsService(prisma);

    await expect(
      service.adminReview(
        "inspection-1",
        { id: "admin-1", roles: ["ADMIN"] },
        "ARCHIVED" as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
