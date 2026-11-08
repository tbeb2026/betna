import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { TranslationService } from "./translation.service";

type Listing = any;
type Actor = string | { id?: string; roles?: unknown[] };

const PUBLIC_STATUSES = new Set(["PUBLISHED"]);
const EDITABLE_FIELDS = [
  "title",
  "description",
  "category",
  "subcategory",
  "amenities",
  "publicLocationLabel",
  "publicLatitude",
  "publicLongitude",
];
const MATERIAL_EDIT_FIELDS = new Set([
  "basePrice",
  "offerings",
  "media",
  "mediaIds",
  "corePhotos",
  "exactAddress",
  "exactLatitude",
  "exactLongitude",
  "exactLocation",
  "category",
  "subcategory",
  "bedrooms",
  "capacity",
  "amenities",
  "publicLocationLabel",
  "publicLatitude",
  "publicLongitude",
  "safetyNotes",
  "authorizationAttested",
]);

/** Owns the transition from verified private data to a public listing. */
@Injectable()
export class PublishingService {
  private readonly approvedSnapshots = new Map<string, Listing>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly translations?: TranslationService,
  ) {}

  async publish(propertyId: string, actor?: Actor): Promise<Listing> {
    const property = await this.findProperty(propertyId);
    if (property.status !== "VERIFIED" && property.status !== "PUBLISHED") {
      throw new ConflictException(
        "Only a verified listing can be published",
      );
    }
    if (
      property.verificationValidUntil &&
      new Date(property.verificationValidUntil).getTime() <= Date.now()
    ) {
      throw new ConflictException("Verification has expired");
    }

    const snapshot = await this.publicSnapshot(property);
    this.approvedSnapshots.set(propertyId, snapshot);
    await this.createApprovedVersion(propertyId, snapshot, actor);
    return this.prisma.property.update({
      where: { id: propertyId },
      data: { status: "PUBLISHED" },
      include: this.propertyInclude(),
    });
  }

  /** Put a changed listing back through review without withdrawing its old copy. */
  async createMaterialEditReview(
    propertyId: string,
    patchOrActor: Record<string, unknown> | string = {},
    actorOrPatch?: Actor | Record<string, unknown>,
  ): Promise<Listing> {
    const patch = (
      typeof patchOrActor === "string"
        ? (actorOrPatch && typeof actorOrPatch === "object"
            ? actorOrPatch
            : {})
        : patchOrActor
    ) as Record<string, unknown>;
    const actor =
      typeof patchOrActor === "string"
        ? patchOrActor
        : typeof actorOrPatch === "string"
          ? actorOrPatch
          : undefined;
    const property = await this.findProperty(propertyId);
    if (property.status !== "PUBLISHED") {
      throw new ConflictException("Only a published listing can be edited");
    }
    const material = this.isMaterialEdit(patch);
    if (material) await this.ensureApprovedSnapshot(property, actor);
    const data: Record<string, unknown> = {
      status: material ? "PENDING_REVIEW" : property.status,
    };
    this.addScalarPatchFields(data, patch);
    this.addExactLocationPatchFields(data, patch);
    this.addOfferingPatch(data, patch);
    this.addMediaPatch(data, patch);
    this.addMaterialFactsPatch(data, property, patch);
    return this.prisma.property.update({
      where: { id: propertyId },
      data,
      include: this.propertyInclude(),
    });
  }

  /** Reported fraud is removed from every public projection in the same write. */
  async reportFraud(
    propertyId: string,
    input: { reason?: string } | string = {},
    _actor?: Actor,
  ): Promise<Listing> {
    await this.findProperty(propertyId);
    const reason = typeof input === "string" ? input : input.reason;
    return this.prisma.property.update({
      where: { id: propertyId },
      data: { status: "FRAUD_REVIEW", ...(reason?.trim() ? { fraudReason: reason.trim() } : {}) },
      include: this.propertyInclude(),
    });
  }

  /** Pause published and verified listings whose one-year validity has elapsed. */
  async expireVerification(now: Date | string = new Date()): Promise<string[]> {
    if (typeof now === "string") {
      const property = await this.findProperty(now);
      const validUntil = property.verificationValidUntil
        ? new Date(property.verificationValidUntil)
        : null;
      if (
        validUntil &&
        validUntil.getTime() <= Date.now() &&
        ["PUBLISHED", "VERIFIED", "PENDING_REVIEW"].includes(property.status)
      ) {
        await this.prisma.property.update({
          where: { id: property.id },
          data: { status: "PAUSED" },
        });
        return [property.id];
      }
      return [];
    }
    const expired: Listing[] = [];
    for (const status of ["PUBLISHED", "VERIFIED", "PENDING_REVIEW"] as const) {
      const rows = await this.prisma.property.findMany({
        where: {
          status,
          verificationValidUntil: { lte: now },
        },
        select: { id: true },
      });
      for (const property of rows ?? []) {
        await this.prisma.property.update({
          where: { id: property.id },
          data: { status: "PAUSED" },
        });
        expired.push(property);
      }
    }
    return expired.map((property) => property.id);
  }

  /** Return properties that should receive a renewal reminder before expiry. */
  async renewalReminderCandidates(now = new Date(), days = 30): Promise<string[]> {
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.property.findMany({
      where: {
        status: "PUBLISHED",
        verificationValidUntil: { gt: now, lte: until },
      },
      select: { id: true },
    });
    return (rows ?? []).map((property: Listing) => property.id);
  }

  /** Ownership changes invalidate the old inspection and force a new review. */
  async reverifyOwnershipChange(
    propertyId: string,
    newOwnerId: string,
    actor: Actor,
  ): Promise<Listing> {
    if (!newOwnerId?.trim()) throw new BadRequestException("New owner is required");
    if (!this.hasRole(actor, "ADMIN")) {
      throw new ForbiddenException("Admin access is required");
    }
    if (this.prisma.user?.findUnique) {
      const owner = await this.prisma.user.findUnique({
        where: { id: newOwnerId },
        include: { roles: { include: { role: true } } },
      });
      const roles = (owner?.roles ?? []).map((entry: any) =>
        (typeof entry === "string" ? entry : entry.role?.name ?? entry.name)?.toUpperCase(),
      );
      if (!owner || owner.status !== "ACTIVE" || !roles.includes("OWNER") || roles.includes("AGENT") || roles.includes("BUSINESS")) {
        throw new BadRequestException("New owner must be an active individual owner");
      }
    }
    await this.findProperty(propertyId);
    return this.prisma.property.update({
      where: { id: propertyId },
      data: {
        ownerId: newOwnerId,
        status: "PENDING_INSPECTION",
        verificationValidUntil: null,
        lastInspectedAt: null,
      },
      include: this.propertyInclude(),
    });
  }

  transferOwnership(propertyId: string, newOwnerId: string, actor: Actor) {
    return this.reverifyOwnershipChange(propertyId, newOwnerId, actor);
  }

  /** Public APIs should call this projection and never serialize the Property row directly. */
  async getPublicProjection(propertyId: string, locale = "en") {
    const property = await this.findProperty(propertyId);
    if (this.isExpired(property)) return null;
    if (PUBLIC_STATUSES.has(property.status)) return this.publicSnapshot(property, locale);
    if (property.status !== "PENDING_REVIEW") return null;
    const snapshot =
      this.approvedSnapshots.get(propertyId) ?? (await this.findApprovedSnapshot(propertyId));
    return snapshot ? this.publicSnapshot({ ...snapshot, verificationValidUntil: property.verificationValidUntil, lastInspectedAt: property.lastInspectedAt }, locale, "PUBLISHED") : null;
  }

  async listPublishingQueue() {
    return this.prisma.property.findMany({
      where: { status: { in: ["PENDING_REVIEW", "VERIFIED", "FRAUD_REVIEW", "PAUSED"] } },
      include: this.propertyInclude(),
      orderBy: { updatedAt: "desc" },
    });
  }

  private async findProperty(propertyId: string): Promise<Listing> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: this.propertyInclude(),
    });
    if (!property) throw new NotFoundException("Property not found");
    return property;
  }

  private async ensureApprovedSnapshot(property: Listing, actor?: Actor) {
    if (this.approvedSnapshots.has(property.id)) return;
    const persisted = await this.findApprovedSnapshot(property.id);
    if (persisted) {
      this.approvedSnapshots.set(property.id, persisted);
      return;
    }
    const snapshot = await this.publicSnapshot(property);
    this.approvedSnapshots.set(property.id, snapshot);
    await this.createApprovedVersion(property.id, snapshot, actor);
  }

  private async findApprovedSnapshot(propertyId: string): Promise<Listing | null> {
    if (!this.prisma.propertyVersion?.findFirst) return null;
    const version = await this.prisma.propertyVersion.findFirst({
      where: { propertyId, isApproved: true },
      orderBy: { version: "desc" },
    });
    return version?.snapshot ?? null;
  }

  private async createApprovedVersion(propertyId: string, snapshot: Listing, actor?: Actor) {
    if (!this.prisma.propertyVersion?.create) return;
    const latest = this.prisma.propertyVersion.findFirst
      ? await this.prisma.propertyVersion.findFirst({
          where: { propertyId },
          orderBy: { version: "desc" },
        })
      : null;
    const version = (latest?.version ?? 0) + 1;
    if (this.prisma.propertyVersion.updateMany) {
      await this.prisma.propertyVersion.updateMany({
        where: { propertyId, isApproved: true },
        data: { isApproved: false },
      });
    }
    await this.prisma.propertyVersion.create({
      data: {
        id: randomUUID(),
        propertyId,
        version,
        snapshot,
        isApproved: true,
        approvedAt: new Date(),
        approvedBy: typeof actor === "string" ? actor : actor?.id,
      },
    });
  }

  private async publicSnapshot(property: Listing, locale = "en", status = "PUBLISHED") {
    const requestedLocale = locale.toLowerCase().startsWith("ti") ? "ti" : "en";
    const translation = this.translations
      ? await this.translations.getPublicContent(property.id, requestedLocale)
      : null;
    const lastInspectedAt = property.lastInspectedAt?.toISOString?.() ?? property.lastInspectedAt;
    const verificationValidUntil = property.verificationValidUntil?.toISOString?.() ?? property.verificationValidUntil;
    const availableLocales = this.translations?.getApprovedLocales
      ? await this.translations.getApprovedLocales(property.id)
      : ["en"];
    const normalizedAvailableLocales = availableLocales.map((locale: string) =>
      locale.toLowerCase().split("-")[0],
    );
    const resolvedLocale = normalizedAvailableLocales.includes(requestedLocale)
      ? requestedLocale
      : "en";
    return {
      id: property.id,
      slug: property.slug,
      title: translation?.title ?? property.title,
      description: translation?.description ?? property.description,
      category: property.category,
      subcategory: property.subcategory,
      amenities: property.amenities ?? [],
      status,
      locale: resolvedLocale,
      availableLocales: normalizedAvailableLocales,
      lastInspectedAt,
      verificationValidUntil,
      verification: {
        verified: true,
        badge: "VERIFIED_BY_BETNA",
        lastInspectedAt,
        validUntil: verificationValidUntil,
      },
      location: {
        country: property.country?.code ?? property.countryCode,
        city: property.city?.name ?? property.cityName,
        neighborhood: property.neighborhood?.name ?? property.neighborhoodName,
        label: property.publicLocationLabel,
        latitude: Number(property.publicLatitude),
        longitude: Number(property.publicLongitude),
      },
      offerings: (property.offerings ?? []).map((offering: Listing) => ({
        mode: offering.mode,
        currency: offering.currency,
        basePrice: Number(offering.basePrice),
        negotiable: offering.negotiable,
        minimumNights: offering.minimumNights,
        moveInDate: offering.moveInDate?.toISOString?.() ?? offering.moveInDate,
        leaseDurationMonths: offering.leaseDurationMonths,
      })),
      media: (property.media ?? [])
        .filter((media: Listing) => media.isPublic && media.status === "CLEAN")
        .map((media: Listing) => ({ id: media.id, objectKey: media.objectKey })),
    };
  }

  private propertyInclude() {
    return {
      country: true,
      city: true,
      neighborhood: true,
      offerings: true,
      media: true,
    };
  }

  private isMaterialEdit(patch: Record<string, unknown>): boolean {
    return Object.keys(patch).some((key) => MATERIAL_EDIT_FIELDS.has(key));
  }

  private addScalarPatchFields(
    data: Record<string, unknown>,
    patch: Record<string, unknown>,
  ) {
    for (const key of [
      ...EDITABLE_FIELDS,
      "exactAddress",
      "exactLatitude",
      "exactLongitude",
      "authorizationAttested",
    ]) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) data[key] = patch[key];
    }
  }

  private addExactLocationPatchFields(
    data: Record<string, unknown>,
    patch: Record<string, unknown>,
  ) {
    const location = patch.exactLocation;
    if (!location || typeof location !== "object") return;
    const exact = location as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(exact, "address")) {
      data.exactAddress = exact.address;
    }
    if (Object.prototype.hasOwnProperty.call(exact, "latitude")) {
      data.exactLatitude = exact.latitude;
    }
    if (Object.prototype.hasOwnProperty.call(exact, "longitude")) {
      data.exactLongitude = exact.longitude;
    }
  }

  private addOfferingPatch(data: Record<string, unknown>, patch: Record<string, unknown>) {
    if (Array.isArray(patch.offerings)) {
      data.offerings = {
        deleteMany: {},
        create: patch.offerings.map((offering) => {
          const value = offering as Record<string, unknown>;
          return {
            mode: value.mode,
            currency: value.currency,
            basePrice: value.basePrice,
            negotiable: value.negotiable ?? false,
            minimumNights: value.minimumNights,
            moveInDate: value.moveInDate
              ? new Date(value.moveInDate as string | number | Date)
              : undefined,
            leaseDurationMonths: value.leaseDurationMonths,
          };
        }),
      };
      return;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "basePrice")) {
      data.offerings = { updateMany: { data: { basePrice: patch.basePrice } } };
    }
  }

  private addMediaPatch(data: Record<string, unknown>, patch: Record<string, unknown>) {
    const media = patch.mediaIds ?? patch.corePhotos ?? patch.media;
    if (Array.isArray(media)) {
      data.media = {
        set: media.map((id) => (typeof id === "string" ? { id } : id)),
      };
    }
  }

  private addMaterialFactsPatch(
    data: Record<string, unknown>,
    property: Listing,
    patch: Record<string, unknown>,
  ) {
    const factKeys = ["bedrooms", "capacity", "safetyNotes"];
    const changedFacts = factKeys.filter((key) =>
      Object.prototype.hasOwnProperty.call(patch, key),
    );
    if (changedFacts.length === 0) return;
    data.materialFacts = {
      ...(property.materialFacts && typeof property.materialFacts === "object"
        ? property.materialFacts
        : {}),
      ...Object.fromEntries(changedFacts.map((key) => [key, patch[key]])),
    };
  }

  private isExpired(property: Listing, now = new Date()): boolean {
    return Boolean(
      property.verificationValidUntil &&
        new Date(property.verificationValidUntil).getTime() <= now.getTime(),
    );
  }

  private hasRole(actor: Actor, expected: string): boolean {
    if (!actor || typeof actor === "string") return false;
    return (actor.roles ?? []).some((entry: any) => {
      const role = typeof entry === "string" ? entry : entry?.name ?? entry?.role?.name;
      return typeof role === "string" && role.toUpperCase() === expected;
    });
  }
}
