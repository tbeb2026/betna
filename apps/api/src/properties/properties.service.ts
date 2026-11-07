import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  COUNTRY_CURRENCY,
  type CountryCode,
  type CurrencyCode,
  type RentalMode,
} from "@betna/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePropertyInput, OfferingInput, UpdatePropertyInput } from "./dto";
import { TaxonomyService } from "./taxonomy.service";

type PropertyRecord = any;

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxonomy: TaxonomyService = new TaxonomyService(),
  ) {}

  async createDraft(
    ownerId: string,
    input: CreatePropertyInput,
  ): Promise<PropertyRecord> {
    await this.assertIndividualOwner(ownerId);
    const normalized = await this.normalizeAndValidate(input);
    const countryId = await this.resolveCountryId(
      input.countryCode,
      input.countryId,
    );

    return this.prisma.$transaction(async (tx) =>
      tx.property.create({
        data: {
          ownerId,
          countryId,
          cityId: input.cityId,
          neighborhoodId: input.neighborhoodId,
          title: input.title.trim(),
          slug: this.slugFor(input.title),
          description: input.description.trim(),
          category: input.category,
          subcategory: input.subcategory,
          amenities: input.amenities ?? [],
          status: "DRAFT",
          publicLocationLabel: input.publicLocation.label.trim(),
          publicLatitude: input.publicLocation.latitude,
          publicLongitude: input.publicLocation.longitude,
          exactAddress: input.exactLocation.address.trim(),
          exactLatitude: input.exactLocation.latitude,
          exactLongitude: input.exactLocation.longitude,
          authorizationAttested: input.authorizationAttested === true,
          offerings: {
            create: normalized.map((offering) => ({
              mode: offering.mode,
              currency: offering.currency,
              basePrice: offering.basePrice,
              negotiable: offering.negotiable ?? false,
              minimumNights: offering.minimumNights,
              moveInDate: offering.moveInDate
                ? new Date(offering.moveInDate)
                : undefined,
              leaseDurationMonths: offering.leaseDurationMonths,
            })),
          },
        },
        include: { offerings: true },
      }),
    );
  }

  async updateDraft(
    propertyId: string,
    ownerId: string,
    patch: UpdatePropertyInput,
  ): Promise<PropertyRecord> {
    await this.assertIndividualOwner(ownerId);
    const existing = await this.findOwnedProperty(propertyId, ownerId);
    if (existing.status !== "DRAFT") {
      throw new ConflictException("Only drafts can be edited");
    }

    const merged = this.mergeInput(existing, patch);
    const normalized = await this.normalizeAndValidate(merged);
    const countryId = await this.resolveCountryId(
      merged.countryCode,
      merged.countryId,
    );
    return this.prisma.property.update({
      where: { id: propertyId },
      data: {
        countryId,
        cityId: merged.cityId,
        neighborhoodId: merged.neighborhoodId,
        title: merged.title.trim(),
        description: merged.description.trim(),
        category: merged.category,
        subcategory: merged.subcategory,
        amenities: merged.amenities ?? [],
        publicLocationLabel: merged.publicLocation.label.trim(),
        publicLatitude: merged.publicLocation.latitude,
        publicLongitude: merged.publicLocation.longitude,
        exactAddress: merged.exactLocation.address.trim(),
        exactLatitude: merged.exactLocation.latitude,
        exactLongitude: merged.exactLocation.longitude,
        authorizationAttested: merged.authorizationAttested === true,
        offerings: {
          deleteMany: {},
          create: normalized.map((offering) => ({
            mode: offering.mode,
            currency: offering.currency,
            basePrice: offering.basePrice,
            negotiable: offering.negotiable ?? false,
            minimumNights: offering.minimumNights,
            moveInDate: offering.moveInDate
              ? new Date(offering.moveInDate)
              : undefined,
            leaseDurationMonths: offering.leaseDurationMonths,
          })),
        },
      },
      include: { offerings: true },
    });
  }

  async submit(propertyId: string, ownerId: string): Promise<PropertyRecord> {
    await this.assertIndividualOwner(ownerId);
    const property = await this.findOwnedProperty(propertyId, ownerId);
    if (property.status !== "DRAFT") {
      throw new ConflictException("Only drafts can be submitted");
    }
    if (!property.authorizationAttested) {
      throw new BadRequestException(
        "Owner authorization attestation is required",
      );
    }
    if (!Array.isArray(property.offerings) || property.offerings.length === 0) {
      throw new BadRequestException(
        "At least one public-priced offering is required",
      );
    }
    return this.prisma.property.update({
      where: { id: propertyId },
      data: { status: "PENDING_REVIEW" },
      include: { offerings: true },
    });
  }

  async listForOwner(ownerId: string): Promise<PropertyRecord[]> {
    await this.assertIndividualOwner(ownerId);
    return this.prisma.property.findMany({
      where: { ownerId },
      include: { offerings: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  async listGeography() {
    const countries = await this.prisma.country.findMany({
      where: { code: { in: ["KE", "UG"] } },
      include: {
        cities: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { code: "asc" },
    });
    return countries.map((country: any) => ({
      code: country.code,
      name: country.name,
      currency: country.currency,
      cities: country.cities.map((city: any) => ({
        id: city.id,
        name: city.name,
        slug: city.slug,
      })),
    }));
  }

  async getDraft(propertyId: string, ownerId: string): Promise<PropertyRecord> {
    await this.assertIndividualOwner(ownerId);
    return this.findOwnedProperty(propertyId, ownerId);
  }

  toPublicProperty(property: PropertyRecord) {
    return {
      id: property.id,
      slug: property.slug,
      title: property.title,
      description: property.description,
      category: property.category,
      subcategory: property.subcategory,
      amenities: property.amenities,
      status: property.status,
      location: {
        country: property.country?.code ?? property.countryCode,
        city: property.city?.name ?? property.cityName,
        neighborhood: property.neighborhood?.name ?? property.neighborhoodName,
        label: property.publicLocationLabel,
        latitude: Number(property.publicLatitude),
        longitude: Number(property.publicLongitude),
      },
      offerings: (property.offerings ?? []).map((offering: any) => ({
        mode: offering.mode,
        currency: offering.currency,
        basePrice: Number(offering.basePrice),
        negotiable: offering.negotiable,
        minimumNights: offering.minimumNights,
        moveInDate: offering.moveInDate?.toISOString?.() ?? offering.moveInDate,
        leaseDurationMonths: offering.leaseDurationMonths,
      })),
    };
  }

  private async assertIndividualOwner(ownerId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
      include: { roles: { include: { role: true } } },
    });
    const roles = (user?.roles ?? []).map((entry: any) =>
      (typeof entry === "string"
        ? entry
        : (entry.role?.name ?? entry.name)
      )?.toUpperCase(),
    );
    if (
      !user ||
      !roles.includes("OWNER") ||
      roles.includes("AGENT") ||
      roles.includes("BUSINESS")
    ) {
      throw new ForbiddenException(
        "Only individual owners can manage properties",
      );
    }
  }

  private async findOwnedProperty(
    propertyId: string,
    ownerId: string,
  ): Promise<PropertyRecord> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, ownerId },
      include: { offerings: true, country: true },
    });
    if (!property) throw new NotFoundException("Property not found");
    return property;
  }

  private async resolveCountryId(
    countryCode: CountryCode,
    countryId?: string,
  ): Promise<string> {
    const country = await this.prisma.country?.findUnique?.({
      where: countryId ? { id: countryId } : { code: countryCode },
    });
    if (!country?.id) {
      throw new BadRequestException(
        `Managed country ${countryCode} was not found`,
      );
    }
    if (
      country.code !== countryCode ||
      country.currency !== COUNTRY_CURRENCY[countryCode]
    ) {
      throw new BadRequestException(
        `Country id does not match country code ${countryCode}`,
      );
    }
    return country.id;
  }

  private async normalizeAndValidate(
    input: CreatePropertyInput,
  ): Promise<OfferingInput[]> {
    if (!input.title?.trim() || !input.description?.trim()) {
      throw new BadRequestException("Title and description are required");
    }
    if (!input.cityId || !input.exactLocation?.address?.trim()) {
      throw new BadRequestException("City and exact address are required");
    }
    if (
      !Object.prototype.hasOwnProperty.call(COUNTRY_CURRENCY, input.countryCode)
    ) {
      throw new BadRequestException(
        "Only Kenya and Uganda properties are supported",
      );
    }
    try {
      this.taxonomy.assertManaged(input.category, input.subcategory);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    this.assertCoordinates(input.publicLocation, "public location");
    this.assertCoordinates(input.exactLocation, "exact location");
    if (
      input.publicLocation.latitude === input.exactLocation.latitude &&
      input.publicLocation.longitude === input.exactLocation.longitude
    ) {
      throw new BadRequestException(
        "Public location must remain approximate and differ from the exact location",
      );
    }
    if (!Array.isArray(input.offerings) || input.offerings.length === 0) {
      throw new BadRequestException(
        "At least one public-priced offering is required",
      );
    }

    const expected = COUNTRY_CURRENCY[input.countryCode];
    const modes = new Set<RentalMode>();
    const normalized: OfferingInput[] = [];
    for (const offering of input.offerings) {
      if (offering.mode !== "SHORT_STAY" && offering.mode !== "LONG_TERM") {
        throw new BadRequestException("Unsupported rental mode");
      }
      if (modes.has(offering.mode)) {
        throw new BadRequestException(
          `Only one ${offering.mode} offering is allowed`,
        );
      }
      modes.add(offering.mode);
      if (offering.currency !== expected) {
        throw new BadRequestException(
          `${input.countryCode} properties must use ${expected} public prices`,
        );
      }
      const basePrice = Number(offering.basePrice);
      if (!Number.isFinite(basePrice) || basePrice <= 0) {
        throw new BadRequestException("Public price must be greater than zero");
      }
      if (
        offering.mode === "SHORT_STAY" &&
        offering.minimumNights !== undefined &&
        offering.minimumNights < 1
      ) {
        throw new BadRequestException("Minimum nights must be at least one");
      }
      if (
        offering.mode === "LONG_TERM" &&
        offering.leaseDurationMonths !== undefined &&
        offering.leaseDurationMonths < 1
      ) {
        throw new BadRequestException(
          "Lease duration must be at least one month",
        );
      }
      normalized.push({ ...offering, basePrice });
    }
    return normalized;
  }

  private assertCoordinates(
    location: { latitude: number; longitude: number },
    label: string,
  ): void {
    if (
      !Number.isFinite(location?.latitude) ||
      !Number.isFinite(location?.longitude) ||
      location.latitude < -90 ||
      location.latitude > 90 ||
      location.longitude < -180 ||
      location.longitude > 180
    ) {
      throw new BadRequestException(`${label} coordinates are invalid`);
    }
  }

  private mergeInput(
    existing: PropertyRecord,
    patch: UpdatePropertyInput,
  ): CreatePropertyInput {
    return {
      title: patch.title ?? existing.title,
      description: patch.description ?? existing.description,
      countryCode:
        patch.countryCode ??
        existing.countryCode ??
        existing.country?.code ??
        "KE",
      countryId: patch.countryId ?? existing.countryId,
      cityId: patch.cityId ?? existing.cityId,
      neighborhoodId:
        patch.neighborhoodId ?? existing.neighborhoodId ?? undefined,
      category: patch.category ?? existing.category,
      subcategory: patch.subcategory ?? existing.subcategory ?? undefined,
      amenities: patch.amenities ?? existing.amenities ?? [],
      publicLocation: patch.publicLocation ?? {
        label: existing.publicLocationLabel,
        latitude: Number(existing.publicLatitude),
        longitude: Number(existing.publicLongitude),
      },
      exactLocation: patch.exactLocation ?? {
        address: existing.exactAddress,
        latitude: Number(existing.exactLatitude),
        longitude: Number(existing.exactLongitude),
      },
      authorizationAttested:
        patch.authorizationAttested ?? existing.authorizationAttested,
      offerings: patch.offerings ?? existing.offerings,
    };
  }

  private slugFor(title: string): string {
    const slug = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `${slug || "property"}-${randomUUID().slice(0, 8)}`;
  }
}
