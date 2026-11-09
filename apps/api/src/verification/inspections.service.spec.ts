import { describe, expect, it, vi } from "vitest";
import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from "@nestjs/common";
import { InspectionsService } from "./inspections.service";
import { AssignmentsService } from "./assignments.service";
import { ChecklistService } from "./checklist.service";
import { AuditService } from "../audit/audit.service";

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
  const evidenceRows = new Map<string, any[]>();
  const checklistDefinitions = [
    {
      category: "residential",
      version: 1,
      isPublished: true,
      definition: {
        required: [
          "identityAuthorization",
          "exactLocation",
          "currentPhotos",
          "statedPrice",
          "category",
          "safetyCondition",
          "residentialUtilities",
        ],
      },
    },
  ];
  const mediaRows = new Map<string, any>([
    [
      "media-1",
      {
        id: "media-1",
        purpose: "INSPECTION_EVIDENCE",
        status: "CLEAN",
        propertyId: "property-1",
      },
    ],
    [
      "media-2",
      {
        id: "media-2",
        purpose: "INSPECTION_EVIDENCE",
        status: "CLEAN",
        propertyId: "property-1",
      },
    ],
  ]);
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
    inspectionEvidence: {
      deleteMany: vi.fn(async ({ where }: any) => {
        evidenceRows.delete(where.inspectionId);
      }),
      createMany: vi.fn(async ({ data }: any) => {
        const inspectionId = data[0]?.inspectionId;
        evidenceRows.set(inspectionId, data.map((entry: any) => ({ ...entry })));
      }),
      findMany: vi.fn(async ({ where }: any) => {
        if (where.mediaId?.in) {
          return [...evidenceRows.values()]
            .flat()
            .filter((entry) => where.mediaId.in.includes(entry.mediaId));
        }
        return evidenceRows.get(where.inspectionId) ?? [];
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const inspectionId = where.inspectionId_mediaId.inspectionId;
        const mediaId = where.inspectionId_mediaId.mediaId;
        const entries = evidenceRows.get(inspectionId) ?? [];
        const index = entries.findIndex((entry) => entry.mediaId === mediaId);
        if (index >= 0) entries[index] = { ...entries[index], ...update };
        else entries.push({ ...create });
        evidenceRows.set(inspectionId, entries);
        return entries[index >= 0 ? index : entries.length - 1];
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
      findUnique: vi.fn(async ({ where }: any) => mediaRows.get(where.id) ?? null),
    },
    checklistDefinition: {
      findFirst: vi.fn(async ({ where }: any) => {
        const matches = checklistDefinitions.filter((candidate) =>
          Object.entries(where).every(([key, value]) => candidate[key as keyof typeof candidate] === value),
        );
        return matches.sort((left, right) => right.version - left.version)[0] ?? null;
      }),
      findMany: vi.fn(async () => checklistDefinitions),
    },
  };
  return { prisma, rows, evidenceRows };
}

function makeService(prisma: any) {
  return new InspectionsService(
    prisma,
    new AssignmentsService(prisma),
    new ChecklistService(prisma),
  );
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
  it("uses the published persisted checklist definition for a submission", async () => {
    const { prisma } = makePrisma();
    prisma.checklistDefinition = {
      findFirst: vi.fn().mockResolvedValue({
        category: "residential",
        version: 7,
        isPublished: true,
        definition: { required: ["identityAuthorization", "publishedRequirement"] },
      }),
    };
    const checklist = new ChecklistService(prisma);
    const service = new InspectionsService(prisma, new AssignmentsService(prisma), checklist);
    await service.assign("inspection-1", "verifier-1", { id: "admin-1", roles: ["ADMIN"] });

    await expect(service.submitPendingUpload("inspection-1", "verifier-1", {
      checklist: { identityAuthorization: true },
      evidence: [{ mediaId: "media-1" }],
    })).rejects.toThrow(/publishedRequirement/);

    const submitted = await service.submitPendingUpload("inspection-1", "verifier-1", {
      checklist: { identityAuthorization: true, publishedRequirement: true },
      evidence: [{ mediaId: "media-1" }],
    });

    expect(submitted.checklistVersion).toBe(7);
  });

  it("uses the published checklist requirements while reviewing a report", async () => {
    const { prisma, rows } = makePrisma();
    prisma.checklistDefinition = {
      findFirst: vi.fn().mockResolvedValue({
        category: "residential",
        version: 9,
        isPublished: true,
        definition: { required: ["identityAuthorization", "publishedRequirement"] },
      }),
    };
    const service = new InspectionsService(prisma, new AssignmentsService(prisma), new ChecklistService(prisma));
    Object.assign(rows.get("inspection-1"), {
      status: "READY_FOR_REVIEW",
      requiredEvidenceSynced: true,
      checklist: { identityAuthorization: true },
      checklistVersion: 9,
    });

    await expect(service.adminReview("inspection-1", { id: "admin-1", roles: ["ADMIN"] }, "APPROVED"))
      .rejects.toThrow(/publishedRequirement/);
  });

  it("reviews against the inspection checklist version instead of the latest published version", async () => {
    const { prisma, rows } = makePrisma();
    prisma.checklistDefinition.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.version === 7) {
        return {
          category: "residential",
          version: 7,
          isPublished: false,
          definition: { required: ["identityAuthorization"] },
        };
      }
      return {
        category: "residential",
        version: 9,
        isPublished: true,
        definition: { required: ["identityAuthorization", "newRequirement"] },
      };
    });
    Object.assign(rows.get("inspection-1"), {
      status: "READY_FOR_REVIEW",
      requiredEvidenceSynced: true,
      checklist: { identityAuthorization: true },
      checklistVersion: 7,
    });
    const service = makeService(prisma);

    await expect(
      service.adminReview("inspection-1", { id: "admin-1", roles: ["ADMIN"] }, "APPROVED"),
    ).resolves.toMatchObject({ status: "APPROVED" });
    expect(prisma.checklistDefinition.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { category: "residential", version: 7 } }),
    );
  });

  it("restricts assignments to a verifier assigned to the inspection territory", async () => {
    const { prisma } = makePrisma();
    const service = makeService(prisma);

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

  it.each(["APPROVED", "REJECTED", "EXPIRED"] as const)(
    "does not reassign a terminal inspection in %s state",
    async (status) => {
      const { prisma, rows } = makePrisma();
      const row = rows.get("inspection-1")!;
      Object.assign(row, { status, verifierId: "verifier-1" });
      const before = structuredClone(row);
      const service = makeService(prisma);

      await expect(
        service.assign("inspection-1", "verifier-2", {
          id: "admin-1",
          roles: ["ADMIN"],
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(row).toEqual(before);
      expect(prisma.inspection.update).not.toHaveBeenCalled();
    },
  );

  it("requires the baseline and category checklist before submission can be reviewed", async () => {
    const { prisma } = makePrisma();
    const service = makeService(prisma);
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
        requestKey: "submission-1",
      },
    );
    expect(pending.status).toBe("PENDING_UPLOAD");
    expect(pending.checklistVersion).toBe(1);
  });

  it("rejects admin approval while evidence is pending upload", async () => {
    const { prisma } = makePrisma();
    const service = makeService(prisma);
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

  it("returns the persisted result for a repeated submission request", async () => {
    const { prisma } = makePrisma();
    const service = makeService(prisma);
    await service.assign("inspection-1", "verifier-1", {
      id: "admin-1",
      roles: ["ADMIN"],
    });
    const input = {
      checklist: completeChecklist,
      evidence: [{ mediaId: "media-1" }],
      requestKey: "submission-idempotent",
    };

    const first = await service.submitPendingUpload(
      "inspection-1",
      "verifier-1",
      input,
    );
    const second = await service.submitPendingUpload(
      "inspection-1",
      "verifier-1",
      input,
    );

    expect(second).toEqual(first);
    expect(prisma.inspectionEvidence.createMany).toHaveBeenCalledTimes(1);
  });

  it("retries an offline evidence upload and becomes ready after synchronization", async () => {
    const { prisma } = makePrisma();
    const service = makeService(prisma);
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
    const repeated = await service.markEvidenceSynced(
      "inspection-1",
      "media-1",
      { ok: true },
    );
    expect(repeated).toEqual(ready);
  });

  it("only allows review decisions from READY_FOR_REVIEW", async () => {
    const { prisma } = makePrisma();
    const service = makeService(prisma);
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
        "REJECTED",
      ),
    ).rejects.toThrow(/ready/i);
  });

  it("allows a rejected inspection to resubmit with its same stable request key", async () => {
    const { prisma } = makePrisma();
    const service = makeService(prisma);
    await service.assign("inspection-1", "verifier-1", {
      id: "admin-1",
      roles: ["ADMIN"],
    });
    const input = {
      checklist: completeChecklist,
      evidence: [{ mediaId: "media-1" }],
      requestKey: "stable-submission-key",
    };
    await service.submitPendingUpload("inspection-1", "verifier-1", input);
    await service.markEvidenceSynced("inspection-1", "media-1", {
      ok: true,
    });
    await service.adminReview(
      "inspection-1",
      { id: "admin-1", roles: ["ADMIN"] },
      "REJECTED",
    );

    const resubmitted = await service.submitPendingUpload(
      "inspection-1",
      "verifier-1",
      input,
    );

    expect(resubmitted.status).toBe("PENDING_UPLOAD");
  });

  it("checks assigned verifier access before an idempotent sync replay", async () => {
    const { prisma } = makePrisma();
    const service = makeService(prisma);
    await service.assign("inspection-1", "verifier-1", {
      id: "admin-1",
      roles: ["ADMIN"],
    });
    await service.submitPendingUpload("inspection-1", "verifier-1", {
      checklist: completeChecklist,
      evidence: [{ mediaId: "media-1" }],
    });
    await service.markEvidenceSynced(
      "inspection-1",
      "media-1",
      { ok: true },
      "verifier-1",
    );

    await expect(
      service.markEvidenceSynced(
        "inspection-1",
        "media-1",
        { ok: true },
        "verifier-2",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
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
    const service = makeService(prisma);

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
    const service = makeService(prisma);
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

  it("rejects evidence media already linked to another inspection", async () => {
    const { prisma, rows, evidenceRows } = makePrisma();
    rows.set("inspection-2", {
      ...structuredClone(inspection),
      id: "inspection-2",
      verifierId: "verifier-2",
      territoryId: "territory-2",
    });
    evidenceRows.set("inspection-2", [
      { inspectionId: "inspection-2", mediaId: "media-1" },
    ]);
    const service = makeService(prisma);
    await service.assign("inspection-1", "verifier-1", {
      id: "admin-1",
      roles: ["ADMIN"],
    });

    await expect(service.submitPendingUpload("inspection-1", "verifier-1", {
      checklist: completeChecklist,
      evidence: [{ mediaId: "media-1" }],
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects synchronization for evidence media that does not exist", async () => {
    const { prisma } = makePrisma();
    prisma.media.findUnique = vi.fn(async () => null);
    const service = makeService(prisma);
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

  it("fails closed when media persistence is unavailable", async () => {
    const { prisma, rows, evidenceRows } = makePrisma();
    const service = makeService(prisma);
    await service.assign("inspection-1", "verifier-1", {
      id: "admin-1",
      roles: ["ADMIN"],
    });
    await service.submitPendingUpload("inspection-1", "verifier-1", {
      checklist: completeChecklist,
      evidence: [{ mediaId: "media-1" }],
    });
    const before = structuredClone(rows.get("inspection-1"));
    const beforeEvidence = structuredClone(evidenceRows.get("inspection-1"));
    delete prisma.media.findUnique;

    await expect(
      service.markEvidenceSynced("inspection-1", "media-1", { ok: true }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(rows.get("inspection-1")).toEqual(before);
    expect(evidenceRows.get("inspection-1")).toEqual(beforeEvidence);
  });

  it("fails closed when inspection evidence persistence is unavailable", async () => {
    const { prisma, rows, evidenceRows } = makePrisma();
    const service = makeService(prisma);
    await service.assign("inspection-1", "verifier-1", {
      id: "admin-1",
      roles: ["ADMIN"],
    });
    await service.submitPendingUpload("inspection-1", "verifier-1", {
      checklist: completeChecklist,
      evidence: [{ mediaId: "media-1" }],
    });
    const before = structuredClone(rows.get("inspection-1"));
    const beforeEvidence = structuredClone(evidenceRows.get("inspection-1"));
    delete prisma.inspectionEvidence.upsert;

    await expect(
      service.markEvidenceSynced("inspection-1", "media-1", { ok: true }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(rows.get("inspection-1")).toEqual(before);
    expect(evidenceRows.get("inspection-1")).toEqual(beforeEvidence);
  });

  it("restricts evidence synchronization to the assigned verifier", async () => {
    const { prisma } = makePrisma();
    prisma.media.findUnique = vi.fn(async () => ({
      id: "media-1",
      purpose: "INSPECTION_EVIDENCE",
      status: "CLEAN",
      propertyId: "property-1",
    }));
    const service = makeService(prisma);
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

  it("fails closed when verifier persistence queries are unavailable", async () => {
    const { prisma, rows } = makePrisma();
    Object.assign(rows.get("inspection-1"), { verifierId: "verifier-1" });
    delete prisma.user.findUnique;
    const service = makeService(prisma);

    await expect(service.getForVerifier("inspection-1", "verifier-1"))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects an invalid admin review decision", async () => {
    const { prisma } = makePrisma();
    const service = makeService(prisma);

    await expect(
      service.adminReview(
        "inspection-1",
        { id: "admin-1", roles: ["ADMIN"] },
        "ARCHIVED" as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("re-reads and locks the inspection before review so a stale approval cannot win", async () => {
    const { prisma, rows } = makePrisma();
    Object.assign(rows.get("inspection-1"), {
      status: "READY_FOR_REVIEW",
      requiredEvidenceSynced: true,
      checklist: completeChecklist,
    });
    prisma.$queryRaw = vi.fn().mockResolvedValue([]);
    prisma.$transaction = vi.fn(async (work: any) => {
      // Simulate another reviewer changing the row after the preflight read,
      // but before this transaction acquires its lock.
      rows.get("inspection-1")!.status = "REJECTED";
      return work(prisma);
    });
    const service = makeService(prisma);

    await expect(
      service.adminReview("inspection-1", { id: "admin-1", roles: ["ADMIN"] }, "APPROVED"),
    ).rejects.toThrow(/ready/i);
    expect(rows.get("inspection-1")?.status).toBe("REJECTED");
    expect(prisma.inspection.update).not.toHaveBeenCalled();
  });

  it("leaves inspection and property state unchanged when the transaction audit fails", async () => {
    const { prisma, rows } = makePrisma();
    const row = rows.get("inspection-1")!;
    Object.assign(row, { status: "READY_FOR_REVIEW", requiredEvidenceSynced: true, checklist: completeChecklist });
    const auditCreate = vi.fn().mockRejectedValue(new Error("audit unavailable"));
    prisma.$transaction = vi.fn(async (work: any) => {
      const txRow = { ...row };
      const tx: any = {
        ...prisma,
        inspection: {
          ...prisma.inspection,
          findUnique: vi.fn(async () => txRow),
          updateMany: vi.fn(async ({ data }: any) => { Object.assign(txRow, data); return { count: 1 }; }),
          update: vi.fn(async ({ data }: any) => { Object.assign(txRow, data); return txRow; }),
        },
        property: { ...prisma.property, update: vi.fn(async ({ data }: any) => ({ id: "property-1", ...data })) },
        auditEvent: { create: auditCreate },
      };
      return work(tx);
    });
    const audit = new AuditService({ auditEvent: { create: vi.fn() } } as any);
    const service = new InspectionsService(prisma, new AssignmentsService(prisma), new ChecklistService(prisma), audit);

    await expect(service.adminReview("inspection-1", { id: "admin-1", roles: ["ADMIN"] }, "APPROVED"))
      .rejects.toThrow("audit unavailable");
    expect(row.status).toBe("READY_FOR_REVIEW");
    expect(auditCreate).toHaveBeenCalled();
  });
});
