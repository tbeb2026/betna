import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PublishingService } from "./publishing.service";

export type PublicDiscoveryFilters = {
  country?: string;
  city?: string;
  category?: string;
  subcategory?: string;
  mode?: "SHORT_STAY" | "LONG_TERM" | string;
  minPrice?: number | string;
  maxPrice?: number | string;
  locale?: string;
  page?: number | string;
  limit?: number | string;
};

type PublicProperty = Record<string, any>;

const DISCOVERABLE_STATUSES = ["PUBLISHED", "PENDING_REVIEW"] as const;

/** Indexed discovery over published rows, followed by the Task 8 public projection boundary. */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publishing: PublishingService,
  ) {}

  async search(filters: PublicDiscoveryFilters = {}): Promise<PublicProperty[]> {
    this.validateFilters(filters);
    const locale = this.normalizeLocale(filters.locale);
    const where = this.whereFor(filters);
    const rows = await this.prisma.property.findMany({
      where,
      include: {
        country: true,
        city: true,
        neighborhood: true,
        offerings: true,
        media: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const projected: PublicProperty[] = [];
    for (const row of rows ?? []) {
      const projection = await this.publishing.getPublicProjection(row.id, locale);
      if (!projection || projection.status !== "PUBLISHED") continue;
      if (!projection.verificationValidUntil || new Date(projection.verificationValidUntil).getTime() <= Date.now()) continue;
      if (!this.matchesPrice(projection, filters)) continue;
      projected.push(projection);
    }

    const page = this.number(filters.page, 1);
    const limit = Math.min(this.number(filters.limit, 24), 100);
    return projected.slice((page - 1) * limit, page * limit);
  }

  async findBySlug(slug: string, locale = "en"): Promise<PublicProperty> {
    const row = await this.prisma.property.findFirst({
      where: {
        slug,
        status: { in: [...DISCOVERABLE_STATUSES] },
        verificationValidUntil: { gt: new Date() },
      },
      include: {
        country: true,
        city: true,
        neighborhood: true,
        offerings: true,
        media: true,
      },
    });
    if (!row) throw new NotFoundException("Published property not found");
    const projection = await this.publishing.getPublicProjection(row.id, this.normalizeLocale(locale));
    if (
      !projection ||
      projection.status !== "PUBLISHED" ||
      !projection.verificationValidUntil ||
      new Date(projection.verificationValidUntil).getTime() <= Date.now()
    ) {
      throw new NotFoundException("Published property not found");
    }
    return projection;
  }

  getBySlug(slug: string, locale = "en") {
    return this.findBySlug(slug, locale);
  }

  private whereFor(filters: PublicDiscoveryFilters): any {
    const offering: Record<string, unknown> = {};
    if (filters.mode) offering.mode = this.mode(filters.mode);
    const minPrice = this.numeric(filters.minPrice);
    const maxPrice = this.numeric(filters.maxPrice);
    if (minPrice !== undefined) offering.basePrice = { ...(offering.basePrice as object), gte: minPrice };
    if (maxPrice !== undefined) offering.basePrice = { ...(offering.basePrice as object), lte: maxPrice };

    return {
      status: { in: [...DISCOVERABLE_STATUSES] },
      ...(filters.country ? { country: { code: filters.country.toUpperCase() } } : {}),
      ...(filters.city ? { city: { slug: filters.city.toLowerCase() } } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.subcategory ? { subcategory: filters.subcategory } : {}),
      ...(Object.keys(offering).length ? { offerings: { some: offering } } : {}),
      verificationValidUntil: { gt: new Date() },
    };
  }

  private matchesPrice(property: PublicProperty, filters: PublicDiscoveryFilters) {
    const min = this.numeric(filters.minPrice);
    const max = this.numeric(filters.maxPrice);
    if (min === undefined && max === undefined) return true;
    return (property.offerings ?? []).some((offering: PublicProperty) => {
      if (filters.mode && String(offering.mode).toUpperCase() !== this.mode(filters.mode)) return false;
      const price = Number(offering.basePrice);
      return Number.isFinite(price) && (min === undefined || price >= min) && (max === undefined || price <= max);
    });
  }

  private numeric(value: number | string | undefined) {
    if (value === undefined || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private number(value: number | string | undefined, fallback: number) {
    const parsed = this.numeric(value);
    return parsed && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  private normalizeLocale(locale?: string) {
    const normalized = (locale ?? "en").toLowerCase().replace("_", "-").split("-")[0];
    return normalized === "ti" ? "ti" : "en";
  }

  private mode(value: string) {
    if (typeof value !== "string") {
      throw new BadRequestException("mode must be SHORT_STAY or LONG_TERM");
    }
    const normalized = value.toUpperCase();
    if (normalized !== "SHORT_STAY" && normalized !== "LONG_TERM") {
      throw new BadRequestException("mode must be SHORT_STAY or LONG_TERM");
    }
    return normalized as "SHORT_STAY" | "LONG_TERM";
  }

  private validateFilters(filters: PublicDiscoveryFilters) {
    if (filters.mode) this.mode(filters.mode);
    const min = this.price(filters.minPrice, "minPrice");
    const max = this.price(filters.maxPrice, "maxPrice");
    if (min !== undefined && max !== undefined && min > max) {
      throw new BadRequestException("minPrice cannot exceed maxPrice");
    }
  }

  private price(value: number | string | undefined, field: string) {
    if (value === undefined || value === "") return undefined;
    if (typeof value === "string" && !value.trim()) {
      throw new BadRequestException(`${field} must be a non-negative number`);
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(`${field} must be a non-negative number`);
    }
    return parsed;
  }
}
