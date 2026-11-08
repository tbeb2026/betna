import { describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { PublishingService } from "./publishing.service";
import { TranslationService } from "./translation.service";

const publishedProperty = {
  id: "property-1",
  ownerId: "owner-1",
  title: "Kilimani garden apartment",
  description: "A verified apartment near the market.",
  category: "residential",
  status: "VERIFIED",
  verificationValidUntil: new Date("2027-01-01T00:00:00.000Z"),
  publicLocationLabel: "Kilimani, Nairobi",
  publicLatitude: -1.2921,
  publicLongitude: 36.8219,
  country: { code: "KE", currency: "KES" },
  city: { name: "Nairobi", slug: "nairobi" },
  neighborhood: { name: "Kilimani", slug: "kilimani" },
  offerings: [],
  media: [],
};

function makePrisma() {
  const rows = new Map([[publishedProperty.id, structuredClone(publishedProperty)]]) as Map<
    string,
    any
  >;
  const versions: any[] = [];
  const translations = new Map<string, any>();
  const prisma: any = {
    property: {
      findUnique: vi.fn(async ({ where }: any) => rows.get(where.id) ?? null),
      findMany: vi.fn(async ({ where }: any = {}) =>
        [...rows.values()].filter((row) => {
          if (where.status && row.status !== where.status) return false;
          if (where.verificationValidUntil?.lte && !(row.verificationValidUntil <= where.verificationValidUntil.lte)) return false;
          return true;
        }),
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const row = rows.get(where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        return row;
      }),
    },
    propertyVersion: {
      create: vi.fn(async ({ data }: any) => {
        const version = { id: `version-${versions.length + 1}`, ...data };
        versions.push(version);
        return version;
      }),
      findFirst: vi.fn(async ({ where }: any) =>
        versions.find((version) => version.propertyId === where.propertyId && version.isApproved) ?? null,
      ),
    },
    propertyTranslation: {
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const key = `${where.propertyId_locale.propertyId}:${where.propertyId_locale.locale}`;
        const existing = translations.get(key);
        const value = { ...(existing ?? create), ...(existing ? update : {}) };
        translations.set(key, value);
        return value;
      }),
      findMany: vi.fn(async ({ where }: any) =>
        [...translations.values()].filter((entry) => entry.propertyId === where.propertyId),
      ),
    },
    $transaction: vi.fn(async (callback: any) => callback(prisma)),
  };
  return { prisma, rows, versions, translations };
}

describe("PublishingService", () => {
  it("retains the approved public version while a material edit is under review", async () => {
    const { prisma } = makePrisma();
    const service = new PublishingService(prisma);

    await service.publish("property-1");
    const review = await service.createMaterialEditReview("property-1", {
      title: "Renovated garden apartment",
    });

    expect(review.status).toBe("PENDING_REVIEW");
    await expect(service.getPublicProjection("property-1")).resolves.toMatchObject({
      title: "Kilimani garden apartment",
      status: "PUBLISHED",
    });
    expect(prisma.propertyVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isApproved: true }) }),
    );
  });

  it("pauses a published listing when its one-year verification expires", async () => {
    const { prisma } = makePrisma();
    const service = new PublishingService(prisma);
    await service.publish("property-1");

    const expired = await service.expireVerification(new Date("2027-01-02T00:00:00.000Z"));

    expect(expired).toEqual(expect.arrayContaining(["property-1"]));
    expect(prisma.property.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "property-1" }, data: { status: "PAUSED" } }),
    );
    await expect(service.getPublicProjection("property-1")).resolves.toBeNull();
  });

  it("hides a listing immediately when staff reports fraud", async () => {
    const { prisma } = makePrisma();
    const service = new PublishingService(prisma);
    await service.publish("property-1");

    await service.reportFraud("property-1", { reason: "Duplicate ownership documents" });

    expect(prisma.property.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "property-1" }, data: expect.objectContaining({ status: "FRAUD_REVIEW" }) }),
    );
    await expect(service.getPublicProjection("property-1")).resolves.toBeNull();
  });
});

describe("TranslationService", () => {
  it("publishes English while Tigrinya remains pending", async () => {
    const { prisma } = makePrisma();
    const service = new TranslationService(prisma);
    const translation = await service.upsertApprovedTranslation("property-1", "en", {
      title: "Kilimani garden apartment",
      description: "A verified apartment near the market.",
      approved: true,
    });

    expect(translation).toMatchObject({ locale: "en", approved: true });
    expect(prisma.propertyTranslation.upsert).toHaveBeenCalled();
    await expect(service.getTranslation("property-1", "ti")).resolves.toBeNull();
    await expect(service.getTranslation("property-1", "en")).resolves.toMatchObject({
      title: "Kilimani garden apartment",
    });
  });

  it("does not allow an unverified listing to publish", async () => {
    const { prisma } = makePrisma();
    prisma.property.findUnique.mockResolvedValueOnce({ ...publishedProperty, status: "PENDING_REVIEW" });
    const service = new PublishingService(prisma);

    await expect(service.publish("property-1")).rejects.toBeInstanceOf(ConflictException);
  });
});
