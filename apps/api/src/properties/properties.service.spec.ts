import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PropertiesService } from "./properties.service";

const owner = {
  id: "owner-1",
  roles: [{ role: { name: "OWNER" } }],
};

const baseInput = {
  title: "Kilimani garden apartment",
  description: "A bright place near the market.",
  countryCode: "KE" as const,
  cityId: "city-ke-nairobi",
  neighborhoodId: "neighborhood-kilimani",
  category: "residential",
  subcategory: "apartment",
  amenities: ["WIFI", "PARKING"],
  publicLocation: {
    label: "Kilimani, Nairobi",
    latitude: -1.2921,
    longitude: 36.7875,
  },
  exactLocation: {
    address: "12 Example Lane, Kilimani, Nairobi",
    latitude: -1.292112,
    longitude: 36.787511,
  },
  authorizationAttested: true,
  offerings: [
    {
      mode: "SHORT_STAY" as const,
      currency: "KES" as const,
      basePrice: 6500,
      negotiable: false,
      minimumNights: 2,
    },
    {
      mode: "LONG_TERM" as const,
      currency: "KES" as const,
      basePrice: 120000,
      negotiable: true,
      moveInDate: "2026-12-01",
      leaseDurationMonths: 12,
    },
  ],
};

function makePrisma() {
  const properties: any[] = [];
  const users = new Map([[owner.id, owner]]);
  const prisma: any = {
    property: {
      create: vi.fn(async ({ data, include }: any) => {
        const created = {
          id: `property-${properties.length + 1}`,
          ...data,
          offerings: data.offerings?.create ?? [],
        };
        properties.push(created);
        return created;
      }),
      findFirst: vi.fn(async ({ where }: any) =>
        properties.find((property) =>
          Object.entries(where).every(([key, value]) => property[key] === value),
        ) ?? null,
      ),
      findMany: vi.fn(async ({ where }: any = {}) =>
        properties.filter((property) =>
          Object.entries(where).every(([key, value]) => property[key] === value),
        ),
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const property = properties.find((entry) => entry.id === where.id);
        Object.assign(property, data);
        return property;
      }),
    },
    user: {
      findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null),
    },
    country: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.code === "KE" ? { id: "country-ke", code: "KE", currency: "KES" } : null,
      ),
    },
    $transaction: vi.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
  };
  return { prisma, properties };
}

describe("PropertiesService", () => {
  it("lets one individual owner create multiple drafts with separate rental offerings", async () => {
    const { prisma } = makePrisma();
    const service = new PropertiesService(prisma);

    const first = await service.createDraft(owner.id, baseInput);
    const second = await service.createDraft(owner.id, {
      ...baseInput,
      title: "Karen guesthouse",
      cityId: "city-ke-nairobi",
      offerings: [baseInput.offerings[0]],
    });

    expect(first.id).not.toBe(second.id);
    expect(first.offerings).toHaveLength(2);
    expect(first.offerings.map((offering: any) => offering.mode)).toEqual([
      "SHORT_STAY",
      "LONG_TERM",
    ]);
    expect(prisma.property.create).toHaveBeenCalledTimes(2);
  });

  it("requires a public local-currency price before creating a draft", async () => {
    const { prisma } = makePrisma();
    const service = new PropertiesService(prisma);

    await expect(
      service.createDraft(owner.id, {
        ...baseInput,
        offerings: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it("rejects an offering currency that does not match the property country", async () => {
    const { prisma } = makePrisma();
    const service = new PropertiesService(prisma);

    await expect(
      service.createDraft(owner.id, {
        ...baseInput,
        offerings: [
          { ...baseInput.offerings[0], currency: "UGX" as const },
        ],
      }),
    ).rejects.toThrow(/KES/i);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it("keeps exact location private and requires attestation to submit", async () => {
    const { prisma } = makePrisma();
    const service = new PropertiesService(prisma);
    const draft = await service.createDraft(owner.id, baseInput);

    expect(draft.publicLocationLabel).toBe(baseInput.publicLocation.label);
    expect(draft.exactAddress).toBe(baseInput.exactLocation.address);
    const publicProjection = service.toPublicProperty(draft);
    expect(publicProjection).not.toHaveProperty("exactAddress");
    expect(publicProjection).not.toHaveProperty("exactLatitude");
    expect(publicProjection.location).toMatchObject({
      label: baseInput.publicLocation.label,
      latitude: baseInput.publicLocation.latitude,
    });

    await expect(service.submit(draft.id, owner.id)).resolves.toMatchObject({
      status: "PENDING_REVIEW",
    });
  });

  it("does not allow a non-owner or unattested account to submit listings", async () => {
    const { prisma } = makePrisma();
    prisma.user.findUnique.mockResolvedValueOnce({
      id: "agent-1",
      roles: [{ role: { name: "AGENT" } }],
    });
    const service = new PropertiesService(prisma);

    await expect(service.createDraft("agent-1", baseInput)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
