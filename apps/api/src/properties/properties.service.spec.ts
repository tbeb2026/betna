import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PropertiesService } from "./properties.service";

const owner = {
  id: "owner-1",
  roles: [{ role: { name: "OWNER" } }],
};

const CITY_KE_NAIROBI_ID = "11111111-1111-4111-8111-111111111111";
const CITY_UG_KAMPALA_ID = "22222222-2222-4222-8222-222222222222";
const CITY_UNKNOWN_ID = "33333333-3333-4333-8333-333333333333";

const baseInput = {
  title: "Kilimani garden apartment",
  description: "A bright place near the market.",
  countryCode: "KE" as const,
  cityId: CITY_KE_NAIROBI_ID,
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
    latitude: -1.2941,
    longitude: 36.7895,
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
      findFirst: vi.fn(async ({ where, include }: any) => {
        const property =
          properties.find((entry) =>
            Object.entries(where).every(([key, value]) => entry[key] === value),
          ) ?? null;
        if (!property || include?.country) return property;
        const { country: _country, ...withoutCountry } = property;
        return withoutCountry;
      }),
      findMany: vi.fn(async ({ where }: any = {}) =>
        properties.filter((property) =>
          Object.entries(where).every(
            ([key, value]) => property[key] === value,
          ),
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
        where.code === "KE" || where.id === "country-ke"
          ? { id: "country-ke", code: "KE", currency: "KES" }
          : where.code === "UG" || where.id === "country-ug"
            ? { id: "country-ug", code: "UG", currency: "UGX" }
            : null,
      ),
    },
    city: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.id === CITY_KE_NAIROBI_ID
          ? { id: where.id, countryId: "country-ke" }
          : where.id === CITY_UG_KAMPALA_ID
            ? { id: where.id, countryId: "country-ug" }
            : null,
      ),
    },
    $transaction: vi.fn(async (callback: (tx: any) => unknown) =>
      callback(prisma),
    ),
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
      cityId: CITY_KE_NAIROBI_ID,
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
        offerings: [{ ...baseInput.offerings[0], currency: "UGX" as const }],
      }),
    ).rejects.toThrow(/KES/i);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it("rejects unsupported rental modes before persistence", async () => {
    const { prisma } = makePrisma();
    const service = new PropertiesService(prisma);

    await expect(
      service.createDraft(owner.id, {
        ...baseInput,
        offerings: [{ ...baseInput.offerings[0], mode: "WEEKLY" as never }],
      }),
    ).rejects.toThrow(/rental mode/i);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it("rejects a public pin that exposes the exact location", async () => {
    const { prisma } = makePrisma();
    const service = new PropertiesService(prisma);

    await expect(
      service.createDraft(owner.id, {
        ...baseInput,
        publicLocation: {
          ...baseInput.exactLocation,
          label: "Kilimani, Nairobi",
        },
      }),
    ).rejects.toThrow(/approximate|exact|location/i);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it("rejects a public pin that is only trivially separated from the exact location", async () => {
    const { prisma } = makePrisma();
    const service = new PropertiesService(prisma);

    await expect(
      service.createDraft(owner.id, {
        ...baseInput,
        publicLocation: {
          ...baseInput.publicLocation,
          latitude: baseInput.exactLocation.latitude - 0.0001,
          longitude: baseInput.exactLocation.longitude,
        },
      }),
    ).rejects.toThrow(/meaningfully approximate|separation|0\.001/i);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it("rejects a city that belongs to a different country", async () => {
    const { prisma } = makePrisma();
    const service = new PropertiesService(prisma);

    await expect(
      service.createDraft(owner.id, {
        ...baseInput,
        cityId: CITY_UG_KAMPALA_ID,
      }),
    ).rejects.toThrow(/city.*country|country.*city/i);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown city id before persistence", async () => {
    const { prisma } = makePrisma();
    const service = new PropertiesService(prisma);

    await expect(
      service.createDraft(owner.id, {
        ...baseInput,
        cityId: CITY_UNKNOWN_ID,
      }),
    ).rejects.toThrow(/city.*country|country.*city/i);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it("rejects a malformed city id as a bad request before Prisma lookup", async () => {
    const { prisma } = makePrisma();
    prisma.city.findUnique.mockRejectedValueOnce(new Error("invalid UUID"));
    const service = new PropertiesService(prisma);

    await expect(
      service.createDraft(owner.id, {
        ...baseInput,
        cityId: "not-a-uuid",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.city.findUnique).not.toHaveBeenCalled();
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it("rejects a country id that does not match the submitted country code", async () => {
    const { prisma } = makePrisma();
    const service = new PropertiesService(prisma);

    await expect(
      service.createDraft(owner.id, {
        ...baseInput,
        countryId: "country-ug",
      }),
    ).rejects.toThrow(/country.*KE|KE.*country/i);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it("requires a managed subcategory for every property draft", async () => {
    const { prisma } = makePrisma();
    const service = new PropertiesService(prisma);

    await expect(
      service.createDraft(owner.id, {
        ...baseInput,
        subcategory: undefined,
      }),
    ).rejects.toThrow(/taxonomy|subcategory/i);
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it("accepts Prisma decimal prices when updating an existing draft", async () => {
    const { prisma } = makePrisma();
    const service = new PropertiesService(prisma);
    const draft = await service.createDraft(owner.id, baseInput);
    draft.offerings = draft.offerings.map((offering: any) => ({
      ...offering,
      basePrice: new Prisma.Decimal(offering.basePrice),
    }));

    await expect(
      service.updateDraft(draft.id, owner.id, {
        title: "Updated garden apartment",
      }),
    ).resolves.toMatchObject({ title: "Updated garden apartment" });
  });

  it("preserves an Uganda draft country when updating without a country patch", async () => {
    const { prisma } = makePrisma();
    const service = new PropertiesService(prisma);
    const draft = await service.createDraft(owner.id, {
      ...baseInput,
      countryCode: "UG",
      countryId: "country-ug",
      cityId: CITY_UG_KAMPALA_ID,
      offerings: baseInput.offerings.map((offering) => ({
        ...offering,
        currency: "UGX" as const,
      })),
    });
    draft.country = { code: "UG", currency: "UGX" };

    await expect(
      service.updateDraft(draft.id, owner.id, {
        title: "Updated Kampala home",
      }),
    ).resolves.toMatchObject({ title: "Updated Kampala home" });
  });

  it("returns managed launch geography with stable city ids for owner forms", async () => {
    const { prisma } = makePrisma();
    prisma.country.findMany = vi.fn(async () => [
      {
        code: "KE",
        name: "Kenya",
        currency: "KES",
        cities: [{ id: "city-ke-nairobi", name: "Nairobi", slug: "nairobi" }],
      },
    ]);
    const service = new PropertiesService(prisma);

    await expect(service.listGeography()).resolves.toEqual([
      {
        code: "KE",
        name: "Kenya",
        currency: "KES",
        cities: [{ id: "city-ke-nairobi", name: "Nairobi", slug: "nairobi" }],
      },
    ]);
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

    await expect(
      service.createDraft("agent-1", baseInput),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
