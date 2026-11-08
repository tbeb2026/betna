import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { PublicPropertiesController } from "./public-properties.controller";
import { SearchService } from "./search.service";

const visible = {
  id: "published-1",
  slug: "verified-kilimani-home",
  ownerId: "owner-secret",
  title: "Verified Kilimani home",
  description: "A bright, verified home.",
  category: "residential",
  subcategory: "apartment",
  status: "PUBLISHED",
  verificationValidUntil: new Date("2027-01-01T00:00:00.000Z"),
  publicLocationLabel: "Kilimani, Nairobi",
  publicLatitude: -1.2921,
  publicLongitude: 36.8219,
  exactAddress: "12 Private Lane",
  exactLatitude: -1.2922,
  exactLongitude: 36.822,
  country: { code: "KE", name: "Kenya" },
  city: { name: "Nairobi", slug: "nairobi" },
  neighborhood: { name: "Kilimani", slug: "kilimani" },
  offerings: [
    {
      mode: "SHORT_STAY",
      currency: "KES",
      basePrice: 6500,
      negotiable: false,
      minimumNights: 2,
    },
  ],
  media: [
    { id: "public-photo", objectKey: "public/photo.jpg", isPublic: true, status: "CLEAN" },
    { id: "private-evidence", objectKey: "private/evidence.jpg", isPublic: false, status: "CLEAN" },
  ],
};

function makePrisma() {
  const rows = [structuredClone(visible), { ...structuredClone(visible), id: "paused", slug: "paused-home", status: "PAUSED" }, { ...structuredClone(visible), id: "fraud", slug: "fraud-home", status: "FRAUD_REVIEW" }];
  const prisma: any = {
    property: {
      findMany: vi.fn(async ({ where }: any = {}) => rows.filter((row) => {
        if (where.status && row.status !== where.status) return false;
        if (where.country?.code && row.country.code !== where.country.code) return false;
        if (where.city?.slug && row.city.slug !== where.city.slug) return false;
        if (where.category && row.category !== where.category) return false;
        if (where.offerings?.some?.mode && !row.offerings.some((offering: any) => offering.mode === where.offerings.some.mode)) return false;
        return true;
      })),
      findFirst: vi.fn(async ({ where }: any) => rows.find((row) => row.slug === where.slug) ?? null),
    },
  };
  return { prisma, rows };
}

function makePublishing(prisma: any) {
  return {
    getPublicProjection: vi.fn(async (id: string, locale = "en") => {
      const row = prisma.property.findMany.mock.results[0]?.value
        ? undefined
        : undefined;
      const source = [visible, { ...visible, id: "paused", status: "PAUSED" }, { ...visible, id: "fraud", status: "FRAUD_REVIEW" }].find((item) => item.id === id);
      if (!source || source.status !== "PUBLISHED") return null;
      return {
        id: source.id,
        slug: source.slug,
        title: source.title,
        description: source.description,
        category: source.category,
        status: "PUBLISHED",
        locale,
        location: { country: source.country.code, city: source.city.name, label: source.publicLocationLabel, latitude: source.publicLatitude, longitude: source.publicLongitude },
        offerings: source.offerings,
        media: source.media.filter((media: any) => media.isPublic && media.status === "CLEAN").map((media: any) => ({ id: media.id, objectKey: media.objectKey })),
      };
    }),
  };
}

describe("public property discovery", () => {
  it("filters by country, city, category, mode, and price while returning only public fields", async () => {
    const { prisma } = makePrisma();
    const service = new SearchService(prisma, makePublishing(prisma) as any);

    const results = await service.search({
      country: "KE",
      city: "nairobi",
      category: "residential",
      mode: "SHORT_STAY",
      minPrice: 5000,
      maxPrice: 7000,
      locale: "en",
    });

    expect(results).toHaveLength(1);
    expect(results[0]).not.toHaveProperty("ownerId");
    expect(results[0]).not.toHaveProperty("exactAddress");
    expect(results[0]).not.toHaveProperty("exactLatitude");
    expect(results[0]?.media).toEqual([{ id: "public-photo", objectKey: "public/photo.jpg" }]);
    expect(prisma.property.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "PUBLISHED" }) }));
  });

  it("never returns paused or fraud listings", async () => {
    const { prisma } = makePrisma();
    const service = new SearchService(prisma, makePublishing(prisma) as any);

    const results = await service.search({});

    expect(results.map((property) => property.slug)).toEqual(["verified-kilimani-home"]);
  });

  it("looks up a public property by slug and rejects missing listings", async () => {
    const { prisma } = makePrisma();
    const service = new SearchService(prisma, makePublishing(prisma) as any);

    await expect(service.findBySlug("verified-kilimani-home", "ti")).resolves.toMatchObject({ locale: "ti" });
    await expect(service.findBySlug("missing-home")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("exposes the discovery and slug routes without authentication", async () => {
    const search = { search: vi.fn().mockResolvedValue([]), findBySlug: vi.fn().mockResolvedValue({ slug: "home" }) } as any;
    const controller = new PublicPropertiesController(search);

    await expect(controller.list({ country: "KE" })).resolves.toEqual([]);
    await expect(controller.get("home", "en")).resolves.toEqual({ slug: "home" });
  });
});
