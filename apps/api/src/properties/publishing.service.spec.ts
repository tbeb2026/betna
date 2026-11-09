import { describe, expect, it, vi } from "vitest";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { PropertiesModule } from "./properties.module";
import { PublishingService } from "./publishing.service";
import { TranslationService } from "./translation.service";
import { ListingLifecycleJob } from "./listing-lifecycle.job";
import { AuditService } from "../audit/audit.service";

const publishedProperty = {
  id: "property-1",
  ownerId: "owner-1",
  title: "Kilimani garden apartment",
  description: "A verified apartment near the market.",
  category: "residential",
  status: "VERIFIED",
  verificationValidUntil: new Date("2027-01-01T00:00:00.000Z"),
  lastInspectedAt: new Date("2026-01-01T00:00:00.000Z"),
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
      findFirst: vi.fn(async ({ where, orderBy }: any) => {
        const matches = versions.filter(
          (version) => version.propertyId === where.propertyId && version.isApproved,
        );
        if (orderBy?.version === "desc") matches.sort((a, b) => b.version - a.version);
        return matches[0] ?? null;
      }),
      count: vi.fn(async ({ where }: any) =>
        versions.filter((version) => version.propertyId === where.propertyId).length,
      ),
      updateMany: vi.fn(async ({ where, data }: any) => {
        for (const version of versions) {
          if (version.propertyId === where.propertyId && version.isApproved === where.isApproved) {
            Object.assign(version, data);
          }
        }
      }),
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
        [...translations.values()].filter((entry) =>
          entry.propertyId === where.propertyId &&
          (where.approved === undefined || entry.approved === where.approved),
        ),
      ),
      findUnique: vi.fn(async ({ where }: any) =>
        translations.get(`${where.propertyId_locale.propertyId}:${where.propertyId_locale.locale}`) ?? null,
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
      category: "residential-premium",
    });

    expect(review.status).toBe("PENDING_REVIEW");
    await expect(service.getPublicProjection("property-1")).resolves.toMatchObject({
      title: "Kilimani garden apartment",
      status: "PUBLISHED",
      verification: {
        verified: true,
        lastInspectedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(prisma.propertyVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isApproved: true, approvedBy: undefined }) }),
    );
  });

  it("uses a persisted approved version after a fresh service instance", async () => {
    const { prisma } = makePrisma();
    const first = new PublishingService(prisma);
    await first.publish("property-1");
    await first.createMaterialEditReview("property-1", { category: "new-category" });

    const second = new PublishingService(prisma);
    await expect(second.getPublicProjection("property-1")).resolves.toMatchObject({
      title: "Kilimani garden apartment",
      status: "PUBLISHED",
    });
  });

  it("persists a new approved version on every republish and exposes it after reload", async () => {
    const { prisma, rows, versions } = makePrisma();
    const first = new PublishingService(prisma);
    await first.publish("property-1");

    const row = rows.get("property-1")!;
    row.category = "residential-premium";
    row.status = "VERIFIED";
    await first.publish("property-1");

    expect(versions).toHaveLength(2);
    expect(versions[1]).toMatchObject({
      version: 2,
      isApproved: true,
      snapshot: { category: "residential-premium" },
    });
    expect(versions[0].isApproved).toBe(false);

    row.status = "PENDING_REVIEW";
    const fresh = new PublishingService(prisma);
    await expect(fresh.getPublicProjection("property-1")).resolves.toMatchObject({
      category: "residential-premium",
      status: "PUBLISHED",
    });
  });

  it("does not expose an expired approved version during pending review", async () => {
    const { prisma, rows } = makePrisma();
    const service = new PublishingService(prisma);
    await service.publish("property-1");
    await service.createMaterialEditReview("property-1", { category: "new-category" });
    rows.get("property-1")!.verificationValidUntil = new Date("2026-01-01T00:00:00.000Z");

    await expect(service.getPublicProjection("property-1")).resolves.toBeNull();
  });

  it("does not publish or project a property with no verification expiry", async () => {
    const { prisma, rows } = makePrisma();
    rows.get("property-1")!.verificationValidUntil = null;
    const service = new PublishingService(prisma);

    await expect(service.publish("property-1")).rejects.toBeInstanceOf(ConflictException);
    rows.get("property-1")!.status = "PUBLISHED";
    await expect(service.getPublicProjection("property-1")).resolves.toBeNull();
    rows.get("property-1")!.status = "VERIFIED";
    rows.get("property-1")!.verificationValidUntil = new Date("2020-01-01T00:00:00.000Z");
    await expect(service.publish("property-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("treats price and core-photo edits as material changes", async () => {
    const { prisma } = makePrisma();
    const service = new PublishingService(prisma);
    await service.publish("property-1");

    await service.createMaterialEditReview("property-1", { basePrice: 2200 });
    expect(prisma.property.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PENDING_REVIEW" }) }),
    );
  });

  it("persists every supported field from a material edit patch", async () => {
    const { prisma, rows } = makePrisma();
    const service = new PublishingService(prisma);
    await service.publish("property-1");

    const offerings = [{ mode: "SHORT_STAY", currency: "KES", basePrice: 2200 }];
    await service.createMaterialEditReview("property-1", {
      category: "residential-premium",
      exactAddress: "New exact address",
      publicLatitude: -1.3,
      publicLongitude: 36.8,
      offerings,
      mediaIds: ["media-1"],
      bedrooms: 3,
      capacity: 6,
      safetyNotes: "Fire exit checked",
    });

    expect(rows.get("property-1")).toMatchObject({
      category: "residential-premium",
      exactAddress: "New exact address",
      publicLatitude: -1.3,
      publicLongitude: 36.8,
      materialFacts: {
        bedrooms: 3,
        capacity: 6,
        safetyNotes: "Fire exit checked",
      },
    });
    expect(prisma.property.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          offerings: expect.objectContaining({
            deleteMany: {},
            create: expect.arrayContaining([
              expect.objectContaining({ mode: "SHORT_STAY", basePrice: 2200 }),
            ]),
          }),
          media: { set: [{ id: "media-1" }] },
        }),
      }),
    );
  });

  it("requires an admin and an eligible owner for ownership re-verification", async () => {
    const { prisma } = makePrisma();
    prisma.user = {
      findUnique: vi.fn(async ({ where }: any) =>
        where.id === "owner-2"
          ? { id: "owner-2", status: "ACTIVE", roles: [{ role: { name: "OWNER" } }] }
          : null,
      ),
    };
    const service = new PublishingService(prisma);

    await expect(
      service.reverifyOwnershipChange("property-1", "owner-2", undefined as any),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.reverifyOwnershipChange("property-1", "owner-2", { id: "staff-1", roles: ["OWNER"] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.reverifyOwnershipChange("property-1", "owner-2", { id: "staff-1", roles: ["ADMIN"] }),
    ).resolves.toMatchObject({ ownerId: "owner-2", status: "PENDING_INSPECTION" });
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

  it("uses an approved Tigrinya translation in the public projection", async () => {
    const { prisma } = makePrisma();
    const translations = new TranslationService(prisma);
    await translations.upsertApprovedTranslation("property-1", "ti", {
      title: "ቤት ኪሊማኒ",
      description: "የተረጋገጠ አፓርታማ",
    });
    const publishing = new PublishingService(prisma, translations);
    await publishing.publish("property-1");

    await expect(publishing.getPublicProjection("property-1", "ti")).resolves.toMatchObject({
      locale: "ti",
      title: "ቤት ኪሊማኒ",
      description: "የተረጋገጠ አፓርታማ",
    });
  });

  it("falls back to English while Tigrinya translation is pending", async () => {
    const { prisma } = makePrisma();
    const translations = new TranslationService(prisma);
    await translations.queueTranslation("property-1", "ti", {
      title: "ቤት ኪሊማኒ",
      description: "የተረጋገጠ አፓርታማ",
    });
    const publishing = new PublishingService(prisma, translations);
    await publishing.publish("property-1");

    await expect(publishing.getPublicProjection("property-1", "ti")).resolves.toMatchObject({
      locale: "en",
      title: "Kilimani garden apartment",
    });
  });

  it("invokes the lifecycle job on module initialization", async () => {
    vi.useFakeTimers();
    const publishing = { expireVerification: vi.fn().mockResolvedValue([]), renewalReminderCandidates: vi.fn().mockResolvedValue([]) } as any;
    const job = new ListingLifecycleJob(publishing);
    const run = vi.spyOn(job, "run").mockResolvedValue({ expired: [], reminders: [] });
    await job.onModuleInit();
    expect(run).toHaveBeenCalledTimes(1);
    job.onModuleDestroy();
    vi.useRealTimers();
  });

  it("does not allow an unverified listing to publish", async () => {
    const { prisma } = makePrisma();
    prisma.property.findUnique.mockResolvedValueOnce({ ...publishedProperty, status: "PENDING_REVIEW" });
    const service = new PublishingService(prisma);

    await expect(service.publish("property-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("re-reads the lifecycle state after locking so a stale publish cannot bypass review", async () => {
    const { prisma, rows, versions } = makePrisma();
    rows.get("property-1")!.status = "VERIFIED";
    prisma.$transaction = vi.fn(async (work: any) => {
      rows.get("property-1")!.status = "PENDING_REVIEW";
      return work(prisma);
    });
    const service = new PublishingService(prisma);

    await expect(service.publish("property-1")).rejects.toBeInstanceOf(ConflictException);
    expect(versions).toHaveLength(0);
    expect(rows.get("property-1")?.status).toBe("PENDING_REVIEW");
  });

  it("re-reads the lifecycle state after locking so a stale material edit cannot overwrite review", async () => {
    const { prisma, rows } = makePrisma();
    rows.get("property-1")!.status = "PUBLISHED";
    prisma.$transaction = vi.fn(async (work: any) => {
      rows.get("property-1")!.status = "PENDING_REVIEW";
      return work(prisma);
    });
    const service = new PublishingService(prisma);

    await expect(service.createMaterialEditReview("property-1", { category: "changed" }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(rows.get("property-1")?.status).toBe("PENDING_REVIEW");
  });

  it("does not commit a publication version when its transaction audit fails", async () => {
    const { prisma, rows, versions } = makePrisma();
    const auditCreate = vi.fn().mockRejectedValue(new Error("audit unavailable"));
    prisma.$transaction = vi.fn(async (work: any) => {
      const txRow = { ...rows.get("property-1") };
      const txVersions = versions.map((version) => ({ ...version }));
      const tx: any = {
        ...prisma,
        property: {
          ...prisma.property,
          findUnique: vi.fn(async () => txRow),
          update: vi.fn(async ({ data }: any) => { Object.assign(txRow, data); return txRow; }),
        },
        propertyVersion: {
          ...prisma.propertyVersion,
          findFirst: vi.fn(async ({ where, orderBy }: any) => {
            const matches = txVersions.filter((version) => version.propertyId === where.propertyId && (where.isApproved === undefined || version.isApproved === where.isApproved));
            if (orderBy?.version === "desc") matches.sort((left, right) => right.version - left.version);
            return matches[0] ?? null;
          }),
          updateMany: vi.fn(async ({ where, data }: any) => { txVersions.filter((version) => version.propertyId === where.propertyId && version.isApproved === where.isApproved).forEach((version) => Object.assign(version, data)); }),
          create: vi.fn(async ({ data }: any) => { const version = { ...data }; txVersions.push(version); return version; }),
        },
        auditEvent: { create: auditCreate },
      };
      return work(tx);
    });
    const audit = new AuditService({ auditEvent: { create: vi.fn() } } as any);
    const service = new PublishingService(prisma, undefined, audit);

    await expect(service.publish("property-1")).rejects.toThrow("audit unavailable");
    expect(rows.get("property-1")?.status).toBe("VERIFIED");
    expect(versions).toHaveLength(0);
    expect(auditCreate).toHaveBeenCalled();
  });
});

describe("PropertiesModule bootstrap", () => {
  it("resolves publishing and translation services through PrismaService", async () => {
    const { prisma } = makePrisma();
    const module = await Test.createTestingModule({ imports: [PropertiesModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    expect(module.get(PublishingService)).toBeInstanceOf(PublishingService);
    expect(module.get(TranslationService)).toBeInstanceOf(TranslationService);
    await module.close();
  });
});
