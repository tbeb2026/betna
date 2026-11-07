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

    const completed = await service.completeUpload("media-1");
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

    await expect(service.completeUpload("media-1")).rejects.toThrow(
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
});
