import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { MediaScanJob } from "./scan.job";
import { StorageAdapter, type StorageVariant } from "./storage.adapter";

export type MediaPurpose = "LISTING" | "INSPECTION_EVIDENCE";

export type MediaActor = {
  id: string;
  roles?: Array<string | { name?: string; role?: { name?: string } | null }>;
  propertyId?: string;
  contentType?: string;
  sizeBytes?: number;
  fileName?: string;
};

export type UploadInput = {
  propertyId?: string;
  contentType?: string;
  sizeBytes?: number;
  fileName?: string;
};

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
]);
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_COUNTS: Record<MediaPurpose, number> = {
  LISTING: 20,
  INSPECTION_EVIDENCE: 50,
};

@Injectable()
export class MediaService {
  private readonly scanJob: MediaScanJob;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageAdapter = new StorageAdapter(),
    scanJob?: MediaScanJob,
  ) {
    this.scanJob = scanJob ?? new MediaScanJob(prisma, storage);
  }

  async createUploadTarget(
    actor: MediaActor | string,
    purpose: MediaPurpose,
    input: UploadInput = {},
  ) {
    const normalizedActor = this.normalizeActor(actor);
    if (purpose !== "LISTING" && purpose !== "INSPECTION_EVIDENCE") {
      throw new BadRequestException("Unsupported media purpose");
    }
    const propertyId = input.propertyId ?? normalizedActor.propertyId;
    if (!propertyId) throw new BadRequestException("A property is required");
    this.assertPurposeRole(normalizedActor, purpose);
    await this.assertPropertyAccess(normalizedActor, propertyId, purpose);

    const contentType = (input.contentType ?? normalizedActor.contentType ?? "")
      .toLowerCase()
      .trim();
    const sizeBytes = input.sizeBytes ?? normalizedActor.sizeBytes;
    const fileName = input.fileName ?? normalizedActor.fileName ?? "upload";
    this.assertUploadType(contentType, fileName);
    const maxBytes = this.maxBytes(purpose);
    if (
      typeof sizeBytes !== "number" ||
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes <= 0 ||
      sizeBytes > maxBytes
    ) {
      throw new BadRequestException(
        `File size must be between 1 byte and ${maxBytes} bytes`,
      );
    }
    const safeSizeBytes = sizeBytes;

    const existing = await this.prisma.media.count({
      where: { propertyId, purpose, status: { not: "REJECTED" } },
    });
    if (existing >= this.maxCount(purpose)) {
      throw new BadRequestException(
        `Maximum ${purpose.toLowerCase()} media count reached`,
      );
    }

    const id = randomUUID();
    const prefix =
      purpose === "LISTING" ? "public/listings" : "private/inspection-evidence";
    const extension = this.extension(contentType, fileName);
    const objectKey = `${prefix}/${propertyId}/${id}/original.${extension}`;
    const uploadUrl = await this.storage.createSignedUploadUrl(
      objectKey,
      contentType,
      maxBytes,
    );
    const media = await this.prisma.media.create({
      data: {
        id,
        propertyId,
        purpose,
        status: "PENDING",
        objectKey,
        contentType,
        sizeBytes: BigInt(safeSizeBytes),
        isPublic: false,
      },
    });
    return {
      mediaId: media.id,
      objectKey,
      uploadUrl,
      expiresInSeconds: 900,
      maxBytes,
      headers: { "Content-Type": contentType },
    };
  }

  async completeUpload(mediaId: string) {
    try {
      const media = await this.prisma.media.findUnique({
        where: { id: mediaId },
      });
      if (!media) throw new NotFoundException("Media not found");
      return await this.scanJob.process(mediaId);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw error;
    }
  }

  async getPublicVariants(mediaId: string) {
    const media = await this.findMedia(mediaId);
    if (
      media.purpose !== "LISTING" ||
      media.status !== "CLEAN" ||
      media.isPublic !== true ||
      !media.objectKey.startsWith("public/listings/")
    ) {
      throw new ForbiddenException("Media is not publicly available");
    }
    const variants: StorageVariant[] =
      typeof (this.storage as any).responsiveVariants === "function"
        ? (this.storage as any).responsiveVariants(media.objectKey)
        : [320, 640, 1280].map((width) => ({
            width,
            key: `${media.objectKey}.w${width}`,
          }));
    return Promise.all(
      variants.map(async (variant) => ({
        width: variant.width,
        key: variant.key,
        url: await this.storage.createSignedReadUrl(variant.key),
      })),
    );
  }

  async getPrivateUrl(mediaId: string, actor: MediaActor | string) {
    const media = await this.findMedia(mediaId);
    if (
      media.purpose !== "INSPECTION_EVIDENCE" ||
      !media.objectKey.startsWith("private/inspection-evidence/")
    ) {
      throw new ForbiddenException(
        "Only inspection evidence uses private URLs",
      );
    }
    const roles = this.roles(this.normalizeActor(actor));
    if (!roles.some((role) => role === "ADMIN" || role === "VERIFIER")) {
      throw new ForbiddenException(
        "Inspection evidence is restricted to staff",
      );
    }
    if (media.status !== "CLEAN")
      throw new ForbiddenException("Media is not available");
    return {
      mediaId,
      url: await this.storage.createSignedReadUrl(media.objectKey),
    };
  }

  private async findMedia(mediaId: string) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
    });
    if (!media) throw new NotFoundException("Media not found");
    return media;
  }

  private normalizeActor(actor: MediaActor | string): MediaActor {
    return typeof actor === "string" ? { id: actor } : actor;
  }

  private roles(actor: MediaActor): string[] {
    return (actor.roles ?? [])
      .map((role) =>
        typeof role === "string" ? role : (role.name ?? role.role?.name),
      )
      .filter(Boolean)
      .map((role) => String(role).toUpperCase());
  }

  private assertPurposeRole(actor: MediaActor, purpose: MediaPurpose) {
    const roles = this.roles(actor);
    const allowed =
      purpose === "LISTING"
        ? roles.includes("OWNER")
        : roles.includes("VERIFIER") || roles.includes("ADMIN");
    if (!allowed)
      throw new ForbiddenException("You cannot upload this media purpose");
  }

  private async assertPropertyAccess(
    actor: MediaActor,
    propertyId: string,
    purpose: MediaPurpose,
  ) {
    if (!this.prisma.property?.findFirst) return;
    const roles = this.roles(actor);
    const where =
      purpose === "LISTING" && roles.includes("OWNER")
        ? { id: propertyId, ownerId: actor.id }
        : { id: propertyId };
    const property = await this.prisma.property.findFirst({
      where,
      select: { id: true, ownerId: true },
    });
    if (!property) throw new ForbiddenException("Property access denied");
  }

  private assertUploadType(contentType: string, fileName: string) {
    const extension = fileName.toLowerCase().split(".").pop() ?? "";
    if (!IMAGE_TYPES.has(contentType) || !IMAGE_EXTENSIONS.has(extension)) {
      throw new BadRequestException(
        "Unsupported file type; upload an image file",
      );
    }
  }

  private extension(contentType: string, fileName: string) {
    const extension = fileName.toLowerCase().split(".").pop() ?? "";
    if (extension === "jpeg") return "jpg";
    return extension || contentType.split("/")[1] || "jpg";
  }

  private maxBytes(purpose: MediaPurpose) {
    const configured = Number(
      process.env[`MEDIA_${purpose}_MAX_BYTES`] ??
        process.env.MEDIA_MAX_BYTES ??
        DEFAULT_MAX_BYTES,
    );
    return Number.isSafeInteger(configured) && configured > 0
      ? configured
      : DEFAULT_MAX_BYTES;
  }

  private maxCount(purpose: MediaPurpose) {
    const configured = Number(
      process.env[`MEDIA_${purpose}_MAX_COUNT`] ??
        process.env.MEDIA_MAX_COUNT ??
        DEFAULT_COUNTS[purpose],
    );
    return Number.isSafeInteger(configured) && configured > 0
      ? configured
      : DEFAULT_COUNTS[purpose];
  }
}
