import { describe, expect, it, vi } from "vitest";
import { AssignmentsService } from "../verification/assignments.service";
import { ChecklistService } from "../verification/checklist.service";
import { InspectionsService } from "../verification/inspections.service";
import { TaxonomyService } from "./taxonomy.service";
import { PropertiesService } from "./properties.service";
import { PublishingService } from "./publishing.service";

const owner = { id: "owner-1", roles: [{ role: { name: "OWNER" } }] };
const admin = { id: "admin-1", roles: [{ role: { name: "ADMIN" } }] };
const verifier = {
  id: "verifier-1",
  roles: [{ role: { name: "VERIFIER" } }],
  territoryAssignments: [{ territoryId: "territory-nairobi" }],
};
const cityId = "11111111-1111-4111-8111-111111111111";
const propertyId = "property-1";

const input = {
  title: "Kilimani garden apartment",
  description: "A bright place near the market.",
  countryCode: "KE" as const,
  cityId,
  category: "residential",
  subcategory: "apartment",
  amenities: ["WIFI"],
  publicLocation: { label: "Kilimani, Nairobi", latitude: -1.2921, longitude: 36.7875 },
  exactLocation: { address: "12 Example Lane", latitude: -1.2941, longitude: 36.7895 },
  authorizationAttested: true,
  offerings: [{ mode: "SHORT_STAY" as const, currency: "KES" as const, basePrice: 6500 }],
};

function makePrisma() {
  const properties: any[] = [];
  const inspections: any[] = [];
  const inspectionEvidence: any[] = [];
  const users = new Map([
    [owner.id, owner],
    [admin.id, admin],
    [verifier.id, verifier],
  ]);
  const prisma: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    country: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.code === "KE" || where.id === "country-ke"
          ? { id: "country-ke", code: "KE", currency: "KES" }
          : null,
      ),
    },
    city: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.id === cityId
          ? { id: cityId, countryId: "country-ke", territoryId: "territory-nairobi" }
          : null,
      ),
    },
    neighborhood: { findUnique: vi.fn(async () => null) },
    property: {
      create: vi.fn(async ({ data }: any) => {
        const property = {
          id: `property-${properties.length + 1}`,
          ...data,
          offerings: data.offerings?.create ?? [],
        };
        properties.push(property);
        return property;
      }),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const property = properties.find((entry) =>
          Object.entries(where).every(([key, value]) => entry[key] === value),
        );
        if (!property) return null;
        return {
          ...property,
          city: include?.city
            ? { id: cityId, territoryId: "territory-nairobi" }
            : undefined,
          country: include?.country ? { id: "country-ke", code: "KE", currency: "KES" } : undefined,
        };
      }),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const property = properties.find((entry) => entry.id === where.id);
        return property
          ? {
              ...property,
              city: include?.city
                ? { id: cityId, territoryId: "territory-nairobi" }
                : undefined,
            }
          : null;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const property = properties.find((entry) =>
          Object.entries(where).every(([key, value]) =>
            typeof value === "object" && value !== null && "in" in value
              ? (value.in as any[]).includes(entry[key])
              : entry[key] === value,
          ),
        );
        if (!property) return { count: 0 };
        Object.assign(property, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const property = properties.find((entry) => entry.id === where.id);
        const next = { ...data };
        if (data.offerings?.create) next.offerings = data.offerings.create;
        Object.assign(property, next);
        return property;
      }),
    },
    inspection: {
      findFirst: vi.fn(async ({ where }: any) =>
        inspections.find((entry) =>
          Object.entries(where).every(([key, value]) => entry[key] === value),
        ) ?? null,
      ),
      findUnique: vi.fn(async ({ where }: any) =>
        inspections.find((entry) =>
          where.id
            ? entry.id === where.id
            : entry.ownerSubmissionKey === where.ownerSubmissionKey,
        ) ?? null,
      ),
      findMany: vi.fn(async ({ where }: any) =>
        inspections.filter((entry) =>
          Object.entries(where).every(([key, value]) =>
            typeof value === "object" && value !== null && "in" in value
              ? (value.in as any[]).includes(entry[key])
              : Array.isArray(value)
                ? value.includes(entry[key])
                : entry[key] === value,
          ),
        ),
      ),
      create: vi.fn(async ({ data }: any) => {
        const inspection = {
          id: `inspection-${inspections.length + 1}`,
          ...data,
          evidence: [],
          property: properties.find((entry) => entry.id === data.propertyId),
        };
        inspections.push(inspection);
        return inspection;
      }),
      upsert: vi.fn(async ({ where, create, include }: any) => {
        const existing = inspections.find((entry) => entry.ownerSubmissionKey === where.ownerSubmissionKey);
        if (existing) return existing;
        return prisma.inspection.create({ data: create, include });
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const inspection = inspections.find((entry) => entry.id === where.id);
        Object.assign(inspection, data);
        return inspection;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = inspections.filter((entry) =>
          Object.entries(where).every(([key, value]) =>
            typeof value === "object" && value !== null && "in" in value
              ? (value.in as any[]).includes(entry[key])
              : entry[key] === value,
          ),
        );
        matches.forEach((entry) => Object.assign(entry, data));
        return { count: matches.length };
      }),
    },
    inspectionEvidence: {
      findMany: vi.fn(async ({ where }: any) =>
        inspectionEvidence.filter((entry) =>
          where.inspectionId
            ? entry.inspectionId === where.inspectionId
            : where.mediaId?.in?.includes(entry.mediaId),
        ),
      ),
      deleteMany: vi.fn(async ({ where }: any) => {
        for (let index = inspectionEvidence.length - 1; index >= 0; index -= 1) {
          if (inspectionEvidence[index].inspectionId === where.inspectionId) {
            inspectionEvidence.splice(index, 1);
          }
        }
      }),
      createMany: vi.fn(async ({ data }: any) => {
        inspectionEvidence.push(...data);
      }),
    },
    media: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.id === "media-1"
          ? { id: "media-1", purpose: "INSPECTION_EVIDENCE", status: "CLEAN", propertyId }
          : null,
      ),
    },
    checklistDefinition: {
      findFirst: vi.fn(async () => ({
        category: "residential",
        version: 1,
        isPublished: true,
        definition: { required: ["identityAuthorization"] },
      })),
    },
    $transaction: vi.fn(async (callback: (tx: any) => unknown) => {
      const propertiesSnapshot = structuredClone(properties);
      const inspectionsSnapshot = structuredClone(inspections);
      const evidenceSnapshot = structuredClone(inspectionEvidence);
      try {
        return await callback(prisma);
      } catch (error) {
        properties.splice(0, properties.length, ...propertiesSnapshot);
        inspections.splice(0, inspections.length, ...inspectionsSnapshot);
        inspectionEvidence.splice(0, inspectionEvidence.length, ...evidenceSnapshot);
        throw error;
      }
    }),
  };
  return { prisma, properties, inspections };
}

function makePropertiesService(prisma: any, inspectionsService: InspectionsService, audit?: any) {
  return new PropertiesService(
    prisma,
    new TaxonomyService(),
    inspectionsService,
    undefined,
    audit,
  );
}

describe("owner submission inspection workflow", () => {
  it("creates one contextual draft inspection that admins can assign within its territory", async () => {
    const { prisma, inspections } = makePrisma();
    const inspectionService = new InspectionsService(
      prisma,
      new AssignmentsService(prisma),
      new ChecklistService(prisma),
    );
    const properties = makePropertiesService(prisma, inspectionService);
    const draft = await properties.createDraft(owner.id, input);

    const [submitted] = await Promise.all([
      properties.submit(draft.id, owner.id),
      properties.submit(draft.id, owner.id),
    ]);
    const retried = await properties.submit(draft.id, owner.id);

    expect(submitted.status).toBe("PENDING_REVIEW");
    expect(retried.id).toBe(submitted.id);
    expect(inspections).toHaveLength(1);
    expect(inspections[0]).toMatchObject({
      propertyId: draft.id,
      status: "DRAFT",
      cityId,
      territoryId: "territory-nairobi",
    });

    await expect(inspectionService.listForAdmin()).resolves.toEqual(inspections);
    await expect(
      inspectionService.assign(inspections[0].id, verifier.id, { id: admin.id, roles: ["ADMIN"] }),
    ).resolves.toMatchObject({ verifierId: verifier.id, status: "DRAFT" });
    await expect(inspectionService.listForVerifier(verifier.id)).resolves.toEqual(inspections);
  });

  it("keeps owner submission idempotency separate from verifier report request keys", async () => {
    const { prisma, inspections } = makePrisma();
    const inspectionService = new InspectionsService(
      prisma,
      new AssignmentsService(prisma),
      new ChecklistService(prisma),
    );
    const properties = makePropertiesService(prisma, inspectionService);
    const draft = await properties.createDraft(owner.id, input);
    await properties.submit(draft.id, owner.id);
    await inspectionService.assign(inspections[0].id, verifier.id, {
      id: admin.id,
      roles: ["ADMIN"],
    });

    const report = await inspectionService.submitPendingUpload(inspections[0].id, verifier.id, {
      checklist: { identityAuthorization: true },
      evidence: [{ mediaId: "media-1" }],
      requestKey: "verifier-report-1",
    });

    expect(report).not.toBeNull();
    expect(inspections[0]).toMatchObject({
      ownerSubmissionKey: `owner-submit:${draft.id}`,
      reportRequestKey: "verifier-report-1",
    });
    await expect(properties.submit(draft.id, owner.id)).resolves.toMatchObject({
      id: draft.id,
      status: "PENDING_REVIEW",
    });
  });

  it("returns rejected listings to the owner as a draft and creates a fresh review inspection on resubmission", async () => {
    const { prisma, inspections, properties: rows } = makePrisma();
    const inspectionService = new InspectionsService(
      prisma,
      new AssignmentsService(prisma),
      new ChecklistService(prisma),
    );
    const properties = makePropertiesService(prisma, inspectionService);
    const draft = await properties.createDraft(owner.id, input);
    await properties.submit(draft.id, owner.id);
    const rejectedInspection = inspections[0];
    Object.assign(rejectedInspection, {
      status: "READY_FOR_REVIEW",
      requiredEvidenceSynced: true,
      checklist: { identityAuthorization: true },
    });

    await inspectionService.adminReview(
      rejectedInspection.id,
      admin,
      "REJECTED",
      "Please correct the listing details",
    );

    expect(rows[0].status).toBe("DRAFT");
    expect(rejectedInspection).toMatchObject({
      status: "REJECTED",
      ownerSubmissionKey: null,
    });

    const edited = await properties.updateDraft(draft.id, owner.id, {
      title: "Corrected garden apartment",
    } as any);
    expect(edited.title).toBe("Corrected garden apartment");

    await properties.submit(draft.id, owner.id);
    expect(rows[0].status).toBe("PENDING_REVIEW");
    expect(inspections).toHaveLength(2);
    expect(inspections[1]).toMatchObject({
      propertyId: draft.id,
      status: "DRAFT",
      ownerSubmissionKey: `owner-submit:${draft.id}`,
    });
    await expect(inspectionService.listForAdmin()).resolves.toEqual([inspections[1]]);
  });

  it("retires old inspections and creates a reachable draft when ownership changes", async () => {
    const { prisma, inspections, properties: rows } = makePrisma();
    const inspectionService = new InspectionsService(
      prisma,
      new AssignmentsService(prisma),
      new ChecklistService(prisma),
    );
    const properties = makePropertiesService(prisma, inspectionService);
    const publishing = new PublishingService(
      prisma,
      undefined,
      undefined,
      undefined,
      inspectionService,
    );
    const draft = await properties.createDraft(owner.id, input);
    await properties.submit(draft.id, owner.id);
    prisma.user.findUnique.mockImplementation(async ({ where }: any) =>
      where.id === "owner-2"
        ? { id: "owner-2", status: "ACTIVE", roles: [{ role: { name: "OWNER" } }] }
        : owner,
    );

    await publishing.reverifyOwnershipChange(
      draft.id,
      "owner-2",
      admin,
    );

    expect(rows[0].status).toBe("PENDING_INSPECTION");
    expect(inspections).toHaveLength(2);
    expect(inspections[0]).toMatchObject({ status: "EXPIRED", verifierId: null });
    expect(inspections[1]).toMatchObject({
      propertyId: draft.id,
      status: "DRAFT",
      cityId,
      territoryId: "territory-nairobi",
    });
    await expect(inspectionService.listForAdmin()).resolves.toEqual([inspections[1]]);
  });

  it("creates a fresh owner draft after a rejected transfer inspection without mutating the approved history", async () => {
    const { prisma, inspections, properties: rows } = makePrisma();
    const inspectionService = new InspectionsService(
      prisma,
      new AssignmentsService(prisma),
      new ChecklistService(prisma),
    );
    const properties = makePropertiesService(prisma, inspectionService);
    const publishing = new PublishingService(
      prisma,
      undefined,
      undefined,
      undefined,
      inspectionService,
    );
    const draft = await properties.createDraft(owner.id, input);
    await properties.submit(draft.id, owner.id);
    const approvedInspection = inspections[0];
    const historicEvidence = [{ id: "historic-evidence", mediaId: "media-1" }];
    Object.assign(approvedInspection, {
      status: "READY_FOR_REVIEW",
      requiredEvidenceSynced: true,
      checklist: { identityAuthorization: true },
      evidence: historicEvidence,
      reportRequestKey: "historic-report",
      notes: "Historic approved report",
    });
    await inspectionService.adminReview(approvedInspection.id, admin, "APPROVED");
    await publishing.publish(draft.id, admin);

    prisma.user.findUnique.mockImplementation(async ({ where }: any) =>
      where.id === "owner-2"
        ? { id: "owner-2", status: "ACTIVE", roles: [{ role: { name: "OWNER" } }] }
        : owner,
    );
    await publishing.reverifyOwnershipChange(draft.id, "owner-2", admin);

    const transferInspection = inspections[1];
    Object.assign(transferInspection, {
      status: "READY_FOR_REVIEW",
      requiredEvidenceSynced: true,
      checklist: { identityAuthorization: true },
    });
    await inspectionService.adminReview(
      transferInspection.id,
      admin,
      "REJECTED",
      "Please correct the transfer details",
    );
    await properties.updateDraft(draft.id, "owner-2", { title: "Corrected transfer listing" } as any);
    await properties.submit(draft.id, "owner-2");

    expect(inspections).toHaveLength(3);
    expect(inspections[0]).toMatchObject({
      id: approvedInspection.id,
      status: "EXPIRED",
      ownerSubmissionKey: null,
      evidence: historicEvidence,
      reportRequestKey: "historic-report",
      notes: "Historic approved report",
    });
    expect(inspections[1]).toMatchObject({
      id: transferInspection.id,
      status: "REJECTED",
      ownerSubmissionKey: null,
    });
    expect(inspections[2]).toMatchObject({
      propertyId: draft.id,
      status: "DRAFT",
      ownerSubmissionKey: `owner-submit:${draft.id}`,
    });
    expect(inspections[2].id).not.toBe(approvedInspection.id);
    expect(inspections[2].id).not.toBe(transferInspection.id);
    expect(rows[0].status).toBe("PENDING_REVIEW");
    await expect(publishing.getPublicProjection(draft.id)).resolves.toBeNull();
  });

  it("rejects an owner retry when a guessed key belongs to another property's inspection", async () => {
    const { prisma, inspections, properties: rows } = makePrisma();
    const inspectionService = new InspectionsService(
      prisma,
      new AssignmentsService(prisma),
      new ChecklistService(prisma),
    );
    const properties = makePropertiesService(prisma, inspectionService);
    const first = await properties.createDraft(owner.id, input);
    const second = await properties.createDraft(owner.id, { ...input, title: "Second home" });
    rows[0].status = "PENDING_REVIEW";
    inspections.push({
      id: "inspection-foreign",
      propertyId: second.id,
      ownerSubmissionKey: `owner-submit:${first.id}`,
      reportRequestKey: null,
      status: "DRAFT",
    });

    await expect(properties.submit(first.id, owner.id)).rejects.toThrow(/inspection|draft/i);
  });

  it("rolls back the property transition when draft inspection creation fails", async () => {
    const { prisma, properties: rows } = makePrisma();
    const inspectionService = new InspectionsService(
      prisma,
      new AssignmentsService(prisma),
      new ChecklistService(prisma),
    );
    vi.spyOn(inspectionService, "createDraftForSubmission").mockRejectedValueOnce(
      new Error("inspection persistence failed"),
    );
    const properties = makePropertiesService(prisma, inspectionService);
    const draft = await properties.createDraft(owner.id, input);

    await expect(properties.submit(draft.id, owner.id)).rejects.toThrow(/inspection persistence failed/);
    expect(rows[0].status).toBe("DRAFT");
  });

  it("rolls back the property transition when audit persistence fails", async () => {
    const { prisma, properties: rows } = makePrisma();
    const inspectionService = new InspectionsService(
      prisma,
      new AssignmentsService(prisma),
      new ChecklistService(prisma),
    );
    const audit = { record: vi.fn().mockRejectedValue(new Error("audit persistence failed")) };
    const properties = makePropertiesService(prisma, inspectionService, audit);
    const draft = await properties.createDraft(owner.id, input);

    await expect(properties.submit(draft.id, owner.id)).rejects.toThrow(/audit persistence failed/);
    expect(rows[0].status).toBe("DRAFT");
  });

  it("recovers the exact inspection after a concurrent unique conflict", async () => {
    const { prisma, inspections } = makePrisma();
    const inspectionService = new InspectionsService(
      prisma,
      new AssignmentsService(prisma),
      new ChecklistService(prisma),
    );
    const properties = makePropertiesService(prisma, inspectionService);
    const draft = await properties.createDraft(owner.id, input);
    const existing = {
      id: "inspection-concurrent",
      propertyId: draft.id,
      ownerSubmissionKey: `owner-submit:${draft.id}`,
      reportRequestKey: null,
      status: "DRAFT",
      cityId,
      territoryId: "territory-nairobi",
    };
    inspections.push(existing);
    prisma.inspection.upsert.mockRejectedValueOnce(
      Object.assign(new Error("unique conflict"), { code: "P2002" }),
    );

    await expect(properties.submit(draft.id, owner.id)).resolves.toMatchObject({
      id: draft.id,
      status: "PENDING_REVIEW",
    });
    expect(inspections).toContain(existing);
  });
});
