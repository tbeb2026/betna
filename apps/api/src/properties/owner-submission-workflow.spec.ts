import { describe, expect, it, vi } from "vitest";
import { AssignmentsService } from "../verification/assignments.service";
import { ChecklistService } from "../verification/checklist.service";
import { InspectionsService } from "../verification/inspections.service";
import { PropertiesService } from "./properties.service";

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
          id: propertyId,
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
        Object.assign(property, data);
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
          where.id ? entry.id === where.id : entry.submissionRequestKey === where.submissionRequestKey,
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
        const existing = inspections.find((entry) => entry.submissionRequestKey === where.submissionRequestKey);
        if (existing) return existing;
        return prisma.inspection.create({ data: create, include });
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const inspection = inspections.find((entry) => entry.id === where.id);
        Object.assign(inspection, data);
        return inspection;
      }),
    },
    $transaction: vi.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
  };
  return { prisma, properties, inspections };
}

describe("owner submission inspection workflow", () => {
  it("creates one contextual draft inspection that admins can assign within its territory", async () => {
    const { prisma, inspections } = makePrisma();
    const inspectionService = new InspectionsService(
      prisma,
      new AssignmentsService(prisma),
      new ChecklistService(prisma),
    );
    const properties = new PropertiesService(prisma, undefined, undefined, inspectionService);
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
});
