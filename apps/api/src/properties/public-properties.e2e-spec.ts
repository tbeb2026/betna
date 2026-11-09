import { describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
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
        if (where.status) {
          const statuses = where.status.in ?? [where.status];
          if (!statuses.includes(row.status)) return false;
        }
        if (where.country?.code && row.country.code !== where.country.code) return false;
        if (where.city?.slug && row.city.slug !== where.city.slug) return false;
        if (where.category && row.category !== where.category) return false;
        if (where.offerings?.some?.mode && !row.offerings.some((offering: any) => offering.mode === where.offerings.some.mode)) return false;
        return true;
      })),
      findFirst: vi.fn(async ({ where }: any) => rows.find((row) => {
        if (row.slug !== where.slug) return false;
        if (where.status) {
          const statuses = where.status.in ?? [where.status];
          if (!statuses.includes(row.status)) return false;
        }
        if (where.verificationValidUntil?.gt && !(row.verificationValidUntil && row.verificationValidUntil > where.verificationValidUntil.gt)) return false;
        return true;
      }) ?? null),
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
        verificationValidUntil: source.verificationValidUntil,
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

  it("keeps a pending-review listing discoverable through its approved snapshot", async () => {
    const { prisma, rows } = makePrisma();
    const pending = {
      ...structuredClone(visible),
      id: "pending-home",
      slug: "pending-home",
      status: "PENDING_REVIEW",
    };
    rows.push(pending as any);
    const publishing = {
      getPublicProjection: vi.fn(async (id: string, locale = "en") => {
        const source = rows.find((row) => row.id === id);
        if (!source || !["PUBLISHED", "PENDING_REVIEW"].includes(source.status)) return null;
        return {
          id: source.id,
          slug: source.slug,
          title: source.title,
          status: "PUBLISHED",
          locale,
          verificationValidUntil: source.verificationValidUntil,
          offerings: source.offerings,
          media: [],
        };
      }),
    };
    const service = new SearchService(prisma, publishing as any);

    await expect(service.search({})).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: "pending-home", status: "PUBLISHED" })]),
    );
    await expect(service.findBySlug("pending-home")).resolves.toMatchObject({
      slug: "pending-home",
      status: "PUBLISHED",
    });
  });

  it("excludes pending-review listings without an approved snapshot or with expired verification", async () => {
    const { prisma, rows } = makePrisma();
    rows.push(
      {
        ...structuredClone(visible),
        id: "pending-no-snapshot",
        slug: "pending-no-snapshot",
        status: "PENDING_REVIEW",
      } as any,
      {
        ...structuredClone(visible),
        id: "pending-expired",
        slug: "pending-expired",
        status: "PENDING_REVIEW",
        verificationValidUntil: new Date("2020-01-01T00:00:00.000Z"),
      } as any,
    );
    const publishing = {
      getPublicProjection: vi.fn(async (id: string) => {
        if (id === "pending-no-snapshot") return null;
        if (id === "pending-expired") return null;
        return { id, slug: rows.find((row) => row.id === id)?.slug, status: "PUBLISHED", verificationValidUntil: new Date("2027-01-01T00:00:00.000Z"), offerings: [], media: [] };
      }),
    };
    const service = new SearchService(prisma, publishing as any);

    const result = await service.search({});
    expect(result.map((property) => property.slug)).toEqual(["verified-kilimani-home"]);
    await expect(service.findBySlug("pending-no-snapshot")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("looks up a public property by slug and rejects missing listings", async () => {
    const { prisma } = makePrisma();
    const service = new SearchService(prisma, makePublishing(prisma) as any);

    await expect(service.findBySlug("verified-kilimani-home", "ti")).resolves.toMatchObject({ locale: "ti" });
    await expect(service.findBySlug("missing-home")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a direct slug lookup without a current verification window", async () => {
    const { prisma, rows } = makePrisma();
    rows.push({ ...structuredClone(visible), id: "unverified", slug: "unverified-home", verificationValidUntil: null } as any);
    const service = new SearchService(prisma, makePublishing(prisma) as any);

    await expect(service.findBySlug("unverified-home")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.property.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ verificationValidUntil: { gt: expect.any(Date) } }),
    }));
  });

  it("rejects invalid mode and price query inputs", async () => {
    const { prisma } = makePrisma();
    const service = new SearchService(prisma, makePublishing(prisma) as any);

    await expect(service.search({ mode: "WEEKLY" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.search({ minPrice: "not-a-number" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.search({ minPrice: 9000, maxPrice: 1000 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.property.findMany).not.toHaveBeenCalled();
  });

  it("exposes the discovery and slug routes without authentication", async () => {
    const search = { search: vi.fn().mockResolvedValue([]), findBySlug: vi.fn().mockResolvedValue({ slug: "home" }) } as any;
    const controller = new PublicPropertiesController(search);

    await expect(controller.list({ country: "KE" })).resolves.toEqual([]);
    await expect(controller.get("home", "en")).resolves.toEqual({ slug: "home" });
  });
});
