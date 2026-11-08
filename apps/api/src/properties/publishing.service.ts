import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

type PrismaLike = any;
type Listing = any;
type Actor = string | { id?: string } | undefined;

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

/** Owns the transition from verified private data to a public listing. */
@Injectable()
export class PublishingService {
  private readonly approvedSnapshots = new Map<string, Listing>();

  constructor(private readonly prisma: PrismaLike) {}

  async publish(propertyId: string, actor?: Actor): Promise<Listing> {
    const property = await this.findProperty(propertyId);
    if (property.status === "PUBLISHED") return property;
    if (property.status !== "VERIFIED") {
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

    const snapshot = this.publicSnapshot(property);
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
    await this.ensureApprovedSnapshot(property, actor);
    const data: Record<string, unknown> = { status: "PENDING_REVIEW" };
    for (const key of EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) data[key] = patch[key];
    }
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
        ["PUBLISHED", "VERIFIED"].includes(property.status)
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
    for (const status of ["PUBLISHED", "VERIFIED"]) {
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
  async reverifyOwnershipChange(propertyId: string, newOwnerId: string): Promise<Listing> {
    if (!newOwnerId?.trim()) throw new BadRequestException("New owner is required");
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

  transferOwnership(propertyId: string, newOwnerId: string) {
    return this.reverifyOwnershipChange(propertyId, newOwnerId);
  }

  /** Public APIs should call this projection and never serialize the Property row directly. */
  async getPublicProjection(propertyId: string, locale = "en") {
    const property = await this.findProperty(propertyId);
    if (PUBLIC_STATUSES.has(property.status)) return this.publicSnapshot(property, locale);
    if (property.status !== "PENDING_REVIEW") return null;
    const snapshot =
      this.approvedSnapshots.get(propertyId) ?? (await this.findApprovedSnapshot(propertyId));
    return snapshot ? this.publicSnapshot(snapshot, locale, "PUBLISHED") : null;
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
    const snapshot = this.publicSnapshot(property);
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
    const existing = this.prisma.propertyVersion.findFirst
      ? await this.prisma.propertyVersion.findFirst({
          where: { propertyId, isApproved: true },
          orderBy: { version: "desc" },
        })
      : null;
    if (existing) return;
    const version = this.prisma.propertyVersion.count
      ? (await this.prisma.propertyVersion.count({ where: { propertyId } })) + 1
      : 1;
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

  private publicSnapshot(property: Listing, locale = "en", status = "PUBLISHED") {
    return {
      id: property.id,
      slug: property.slug,
      title: property.title,
      description: property.description,
      category: property.category,
      subcategory: property.subcategory,
      amenities: property.amenities ?? [],
      status,
      locale,
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
}
