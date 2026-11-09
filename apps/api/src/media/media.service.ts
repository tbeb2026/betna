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
  territoryIds?: string[];
  propertyId?: string;
  contentType?: string;
  sizeBytes?: number;
  fileName?: string;
};

export type UploadInput = {
  propertyId?: string;
  inspectionId?: string;
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
    await this.assertPropertyAccess(normalizedActor, propertyId, purpose, input.inspectionId);

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

  async completeUpload(mediaId: string, actor: MediaActor | string) {
    const media = await this.findMedia(mediaId);
    await this.assertMediaCompletionAccess(this.normalizeActor(actor), media);
    if (media.status !== "PENDING") {
      throw new BadRequestException("Media has already been processed");
    }
    return this.scanJob.process(mediaId);
  }

  async getPublicVariants(mediaId: string) {
    const media = await this.findMedia(mediaId);
    const propertyLookup = (this.prisma as any).property?.findUnique;
    const property = await propertyLookup?.({
      where: { id: media.propertyId },
      select: { status: true, verificationValidUntil: true },
    });
    if (
      media.purpose !== "LISTING" ||
      media.status !== "CLEAN" ||
      media.isPublic !== true ||
      !media.objectKey.startsWith("public/listings/") ||
      (propertyLookup &&
        (!property ||
          property.status !== "PUBLISHED" ||
          (property.verificationValidUntil &&
            new Date(property.verificationValidUntil).getTime() <= Date.now())))
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
    const normalizedActor = this.normalizeActor(actor);
    const roles = this.roles(normalizedActor);
    if (!roles.some((role) => role === "ADMIN" || role === "VERIFIER")) {
      throw new ForbiddenException(
        "Inspection evidence is restricted to staff",
      );
    }
    if (roles.includes("VERIFIER")) {
      await this.assertInspectionEvidenceAccess(normalizedActor, media);
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
    inspectionId?: string,
  ) {
    if (!this.prisma.property?.findFirst) return;
    const roles = this.roles(actor);
    if (purpose === "INSPECTION_EVIDENCE") {
      if (!inspectionId) {
        throw new BadRequestException("An inspection is required for evidence uploads");
      }
      const inspection = await this.prisma.inspection?.findUnique?.({
        where: { id: inspectionId },
        select: { id: true, propertyId: true, verifierId: true, territoryId: true },
      });
      if (
        !inspection ||
        inspection.propertyId !== propertyId ||
        (!roles.includes("ADMIN") &&
          (inspection.verifierId !== actor.id ||
            !actor.territoryIds?.includes(inspection.territoryId ?? "")))
      ) {
        throw new ForbiddenException("Inspection evidence access denied");
      }
      return;
    }
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

  private async assertInspectionEvidenceAccess(actor: MediaActor, media: any) {
    if (!this.prisma.inspectionEvidence?.findMany) return;
    const links = await this.prisma.inspectionEvidence?.findMany?.({
      where: { mediaId: media.id },
      include: { inspection: { select: { propertyId: true, verifierId: true, territoryId: true } } },
    });
    if (!Array.isArray(links) || links.length === 0) {
      throw new ForbiddenException("Inspection evidence is not assigned");
    }
    const allowed = links.some((link: any) =>
      link.inspection?.propertyId === media.propertyId &&
      link.inspection?.verifierId === actor.id &&
      actor.territoryIds?.includes(link.inspection.territoryId ?? ""),
    );
    if (!allowed) throw new ForbiddenException("Inspection evidence access denied");
  }

  private async assertMediaCompletionAccess(actor: MediaActor, media: any) {
    const roles = this.roles(actor);
    if (roles.includes("ADMIN") || roles.includes("VERIFIER")) return;
    if (media.purpose === "LISTING" && roles.includes("OWNER")) {
      await this.assertPropertyAccess(actor, media.propertyId, "LISTING");
      return;
    }
    throw new ForbiddenException("Media completion is not authorized");
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
