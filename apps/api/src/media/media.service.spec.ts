import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { MediaService } from "./media.service";

const owner = {
  id: "owner-1",
  roles: ["OWNER"],
  propertyId: "property-1",
};

function makeStorage() {
  return {
    createSignedUploadUrl: vi.fn(
      async (objectKey: string) => `https://uploads.example.test/${objectKey}`,
    ),
    createSignedReadUrl: vi.fn(
      async (objectKey: string) => `https://cdn.example.test/${objectKey}`,
    ),
    scan: vi.fn(async () => ({ clean: true })),
  };
}

function makePrisma(media: any = undefined) {
  let record = media ?? {
    id: "media-1",
    propertyId: "property-1",
    purpose: "LISTING",
    status: "PENDING",
    objectKey: "public/listings/property-1/media-1/original.jpg",
    contentType: "image/jpeg",
    sizeBytes: BigInt(1200),
    isPublic: false,
  };
  return {
    property: {
      findFirst: vi.fn(async () => ({ id: "property-1", ownerId: owner.id })),
      findUnique: vi.fn(async () => ({
        id: "property-1",
        status: "PUBLISHED",
        verificationValidUntil: new Date("2027-01-01T00:00:00.000Z"),
      })),
    },
    media: {
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }: any) => ({ ...record, ...data })),
      findUnique: vi.fn(async () => record),
      update: vi.fn(async ({ data }: any) => {
        record = { ...record, ...data };
        return record;
      }),
    },
  } as any;
}

describe("MediaService", () => {
  it("links an evidence upload target to its assigned inspection", async () => {
    const prisma = makePrisma();
    prisma.inspection = {
      findUnique: vi.fn().mockResolvedValue({
        id: "inspection-1",
        propertyId: "property-1",
        verifierId: "verifier-1",
        territoryId: "territory-1",
      }),
    };
    prisma.inspectionEvidence = { upsert: vi.fn().mockResolvedValue({}) };
    const service = new MediaService(prisma, makeStorage() as any);

    await service.createUploadTarget({
      id: "verifier-1",
      roles: ["VERIFIER"],
      territoryIds: ["territory-1"],
    }, "INSPECTION_EVIDENCE", {
      propertyId: "property-1",
      inspectionId: "inspection-1",
      contentType: "image/jpeg",
      sizeBytes: 1200,
      fileName: "evidence.jpg",
    });

    expect(prisma.inspectionEvidence.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { inspectionId_mediaId: expect.objectContaining({ inspectionId: "inspection-1" }) },
      create: expect.objectContaining({ inspectionId: "inspection-1" }),
    }));
  });

  it("does not serve public variants when property verification has no expiry", async () => {
    const prisma = makePrisma({
      id: "media-1",
      propertyId: "property-1",
      purpose: "LISTING",
      status: "CLEAN",
      objectKey: "public/listings/property-1/media-1/original.jpg",
      contentType: "image/jpeg",
      sizeBytes: BigInt(1200),
      isPublic: true,
    });
    prisma.property.findUnique.mockResolvedValueOnce({
      id: "property-1",
      status: "PUBLISHED",
      verificationValidUntil: null,
    });
    const service = new MediaService(prisma, makeStorage() as any);

    await expect(service.getPublicVariants("media-1")).rejects.toBeInstanceOf(ForbiddenException);
    prisma.property.findUnique.mockResolvedValueOnce({
      id: "property-1",
      status: "PUBLISHED",
      verificationValidUntil: new Date("2020-01-01T00:00:00.000Z"),
    });
    await expect(service.getPublicVariants("media-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks executable uploads before creating a signed target", async () => {
    const storage = makeStorage();
    const prisma = makePrisma();
    const service = new MediaService(prisma, storage as any);

    await expect(
      service.createUploadTarget(
        {
          ...owner,
          contentType: "application/x-msdownload",
          fileName: "run.exe",
        },
        "LISTING",
      ),
    ).rejects.toThrow(/file type|executable|unsupported/i);
    expect(prisma.media.create).not.toHaveBeenCalled();
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("denies private inspection evidence URLs to visitors", async () => {
    const prisma = makePrisma({
      id: "evidence-1",
      propertyId: "property-1",
      purpose: "INSPECTION_EVIDENCE",
      status: "CLEAN",
      objectKey:
        "private/inspection-evidence/property-1/evidence-1/original.jpg",
      contentType: "image/jpeg",
      sizeBytes: BigInt(1200),
      isPublic: false,
    });
    const service = new MediaService(prisma, makeStorage() as any);

    await expect(
      service.getPrivateUrl("evidence-1", {
        id: "visitor-1",
        roles: ["VISITOR"],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns responsive public listing variants after a clean scan", async () => {
    const storage = makeStorage();
    const prisma = makePrisma();
    const service = new MediaService(prisma, storage as any);

    const completed = await service.completeUpload("media-1", owner);
    const variants = await service.getPublicVariants("media-1");

    expect(completed.status).toBe("CLEAN");
    expect(completed.isPublic).toBe(true);
    expect(variants).toHaveLength(3);
    expect(variants.map((variant) => variant.width)).toEqual([320, 640, 1280]);
    expect(
      variants.every((variant) => variant.url.startsWith("https://cdn.")),
    ).toBe(true);
    expect(prisma.media.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "media-1" },
        data: expect.objectContaining({ status: "CLEAN", isPublic: true }),
      }),
    );
  });

  it("does not publish a listing when responsive variant generation fails", async () => {
    const storage = makeStorage();
    (storage as any).generateVariants = vi.fn(async () => {
      throw new Error("image processor unavailable");
    });
    const prisma = makePrisma();
    const service = new MediaService(prisma, storage as any);

    await expect(service.completeUpload("media-1", owner)).rejects.toThrow(
      "image processor unavailable",
    );
    expect(prisma.media.update).not.toHaveBeenCalled();
  });

  it("rejects a public listing response if its object key is private", async () => {
    const prisma = makePrisma({
      id: "media-1",
      propertyId: "property-1",
      purpose: "LISTING",
      status: "CLEAN",
      objectKey: "private/inspection-evidence/property-1/media-1/original.jpg",
      contentType: "image/jpeg",
      sizeBytes: BigInt(1200),
      isPublic: true,
    });
    const service = new MediaService(prisma, makeStorage() as any);

    await expect(service.getPublicVariants("media-1")).rejects.toThrow(
      /publicly available|prefix/i,
    );
  });

  it("does not let an unrelated owner complete another owner's upload", async () => {
    const prisma = makePrisma();
    prisma.property.findFirst.mockResolvedValueOnce(null);
    const service = new MediaService(prisma, makeStorage() as any);

    await expect(
      service.completeUpload("media-1", {
        id: "other-owner",
        roles: ["OWNER"],
      }),
    ).rejects.toThrow(/property access denied|not authorized/i);
  });

  it("denies a foreign verifier completion for linked inspection evidence", async () => {
    const prisma = makePrisma({
      id: "evidence-1",
      propertyId: "property-1",
      purpose: "INSPECTION_EVIDENCE",
      status: "PENDING",
      objectKey: "private/inspection-evidence/property-1/evidence-1/original.jpg",
      contentType: "image/jpeg",
      sizeBytes: BigInt(1200),
      isPublic: false,
    });
    prisma.inspectionEvidence = {
      findMany: vi.fn().mockResolvedValue([
        { mediaId: "evidence-1", inspection: { propertyId: "property-1", verifierId: "verifier-1", territoryId: "territory-1" } },
      ]),
    };
    const service = new MediaService(prisma, makeStorage() as any);

    await expect(service.completeUpload("evidence-1", {
      id: "verifier-2",
      roles: ["VERIFIER"],
      territoryIds: ["territory-1"],
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("audits an authorized private evidence read", async () => {
    const prisma = makePrisma({
      id: "evidence-1",
      propertyId: "property-1",
      purpose: "INSPECTION_EVIDENCE",
      status: "CLEAN",
      objectKey: "private/inspection-evidence/property-1/evidence-1/original.jpg",
      contentType: "image/jpeg",
      sizeBytes: BigInt(1200),
      isPublic: false,
    });
    prisma.inspectionEvidence = {
      findMany: vi.fn().mockResolvedValue([
        { mediaId: "evidence-1", inspection: { propertyId: "property-1", verifierId: "verifier-1", territoryId: "territory-1" } },
      ]),
    };
    const audit = { record: vi.fn().mockResolvedValue({ id: "audit-1" }) };
    const service = new MediaService(prisma, makeStorage() as any, undefined, audit as any);

    await expect(service.getPrivateUrl("evidence-1", {
      id: "verifier-1",
      roles: ["VERIFIER"],
      territoryIds: ["territory-1"],
    })).resolves.toMatchObject({ mediaId: "evidence-1" });
    expect(audit.record).toHaveBeenCalledWith("verifier-1", "INSPECTION_EVIDENCE_VIEWED", expect.objectContaining({
      type: "Media",
      id: "evidence-1",
    }));
  });

  it("denies a foreign verifier private evidence read", async () => {
    const prisma = makePrisma({
      id: "evidence-1",
      propertyId: "property-1",
      purpose: "INSPECTION_EVIDENCE",
      status: "CLEAN",
      objectKey: "private/inspection-evidence/property-1/evidence-1/original.jpg",
      contentType: "image/jpeg",
      sizeBytes: BigInt(1200),
      isPublic: false,
    });
    prisma.inspectionEvidence = {
      findMany: vi.fn().mockResolvedValue([
        { mediaId: "evidence-1", inspection: { propertyId: "property-1", verifierId: "verifier-1", territoryId: "territory-1" } },
      ]),
    };
    const service = new MediaService(prisma, makeStorage() as any);

    await expect(service.getPrivateUrl("evidence-1", {
      id: "verifier-2",
      roles: ["VERIFIER"],
      territoryIds: ["territory-1"],
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("denies verifier A completing or reading evidence linked to verifier B's inspection", async () => {
    const prisma = makePrisma({
      id: "evidence-b",
      propertyId: "property-1",
      purpose: "INSPECTION_EVIDENCE",
      status: "PENDING",
      objectKey: "private/inspection-evidence/property-1/evidence-b/original.jpg",
      contentType: "image/jpeg",
      sizeBytes: BigInt(1200),
      isPublic: false,
    });
    prisma.inspectionEvidence = {
      findMany: vi.fn().mockResolvedValue([
        {
          inspectionId: "inspection-b",
          mediaId: "evidence-b",
          inspection: {
            propertyId: "property-1",
            verifierId: "verifier-b",
            territoryId: "territory-1",
          },
        },
      ]),
    };
    const service = new MediaService(prisma, makeStorage() as any);
    const verifierA = {
      id: "verifier-a",
      roles: ["VERIFIER"],
      territoryIds: ["territory-1"],
    };

    await expect(service.completeUpload("evidence-b", verifierA))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getPrivateUrl("evidence-b", verifierA))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it("requires an audit event before issuing a private evidence URL", async () => {
    const storage = makeStorage();
    const prisma = makePrisma({
      id: "evidence-1",
      propertyId: "property-1",
      purpose: "INSPECTION_EVIDENCE",
      status: "CLEAN",
      objectKey: "private/inspection-evidence/property-1/evidence-1/original.jpg",
      contentType: "image/jpeg",
      sizeBytes: BigInt(1200),
      isPublic: false,
    });
    prisma.inspectionEvidence = {
      findMany: vi.fn().mockResolvedValue([
        {
          mediaId: "evidence-1",
          inspection: {
            propertyId: "property-1",
            verifierId: "verifier-1",
            territoryId: "territory-1",
          },
        },
      ]),
    };
    const service = new MediaService(prisma, storage as any);

    await expect(service.getPrivateUrl("evidence-1", {
      id: "verifier-1",
      roles: ["VERIFIER"],
      territoryIds: ["territory-1"],
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.createSignedReadUrl).not.toHaveBeenCalled();
  });

  it("denies a private evidence URL when audit persistence fails", async () => {
    const storage = makeStorage();
    const prisma = makePrisma({
      id: "evidence-1",
      propertyId: "property-1",
      purpose: "INSPECTION_EVIDENCE",
      status: "CLEAN",
      objectKey: "private/inspection-evidence/property-1/evidence-1/original.jpg",
      contentType: "image/jpeg",
      sizeBytes: BigInt(1200),
      isPublic: false,
    });
    prisma.inspectionEvidence = {
      findMany: vi.fn().mockResolvedValue([
        {
          mediaId: "evidence-1",
          inspection: {
            propertyId: "property-1",
            verifierId: "verifier-1",
            territoryId: "territory-1",
          },
        },
      ]),
    };
    const audit = { record: vi.fn().mockRejectedValue(new Error("audit unavailable")) };
    const service = new MediaService(prisma, storage as any, undefined, audit as any);

    await expect(service.getPrivateUrl("evidence-1", {
      id: "verifier-1",
      roles: ["VERIFIER"],
      territoryIds: ["territory-1"],
    })).rejects.toThrow("audit unavailable");
    expect(storage.createSignedReadUrl).not.toHaveBeenCalled();
  });

  it("creates evidence media and its inspection link in a transaction", async () => {
    const prisma = makePrisma();
    prisma.inspection = {
      findUnique: vi.fn().mockResolvedValue({
        id: "inspection-1",
        propertyId: "property-1",
        verifierId: "verifier-1",
        territoryId: "territory-1",
      }),
    };
    prisma.inspectionEvidence = { upsert: vi.fn().mockResolvedValue({}) };
    const transaction = vi.fn(async (work: any) => work(prisma));
    prisma.$transaction = transaction;
    const service = new MediaService(prisma, makeStorage() as any);

    await service.createUploadTarget({
      id: "verifier-1",
      roles: ["VERIFIER"],
      territoryIds: ["territory-1"],
    }, "INSPECTION_EVIDENCE", {
      propertyId: "property-1",
      inspectionId: "inspection-1",
      contentType: "image/jpeg",
      sizeBytes: 1200,
      fileName: "evidence.jpg",
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(prisma.media.create).toHaveBeenCalledTimes(1);
    expect(prisma.inspectionEvidence.upsert).toHaveBeenCalledTimes(1);
  });

  it("cleans up the media row if evidence linking fails", async () => {
    const prisma = makePrisma();
    prisma.inspection = {
      findUnique: vi.fn().mockResolvedValue({
        id: "inspection-1",
        propertyId: "property-1",
        verifierId: "verifier-1",
        territoryId: "territory-1",
      }),
    };
    prisma.inspectionEvidence = {
      upsert: vi.fn().mockRejectedValue(new Error("link unavailable")),
    };
    prisma.media.delete = vi.fn().mockResolvedValue({});
    prisma.$transaction = vi.fn(async (work: any) => work(prisma));
    const service = new MediaService(prisma, makeStorage() as any);

    await expect(service.createUploadTarget({
      id: "verifier-1",
      roles: ["VERIFIER"],
      territoryIds: ["territory-1"],
    }, "INSPECTION_EVIDENCE", {
      propertyId: "property-1",
      inspectionId: "inspection-1",
      contentType: "image/jpeg",
      sizeBytes: 1200,
      fileName: "evidence.jpg",
    })).rejects.toThrow("link unavailable");
    expect(prisma.media.delete).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
    });
  });

  it("fails closed when property authorization queries are unavailable", async () => {
    const storage = makeStorage();
    const prisma = makePrisma();
    delete prisma.property.findFirst;
    const service = new MediaService(prisma, storage as any);

    await expect(service.completeUpload("media-1", owner))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.scan).not.toHaveBeenCalled();
  });

  it("passes the claimed byte limit and content type into the scan boundary", async () => {
    const storage = makeStorage();
    const prisma = makePrisma();
    const service = new MediaService(prisma, storage as any);

    await service.completeUpload("media-1", owner);

    expect(storage.scan).toHaveBeenCalledWith(
      "public/listings/property-1/media-1/original.jpg",
      {
        contentType: "image/jpeg",
        maxBytes: 1200,
        expectedBytes: 1200,
      },
    );
  });
});
