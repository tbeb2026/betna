import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type TranslationInput = {
  title: string;
  description: string;
  approved?: boolean;
};

@Injectable()
export class TranslationService {
  private readonly local = new Map<string, any>();

  constructor(private readonly prisma: PrismaService) {}

  async upsertApprovedTranslation(
    propertyId: string,
    locale: string,
    input: TranslationInput | string,
    description?: string,
    actorId?: string,
  ) {
    const normalizedLocale = this.locale(locale);
    const values: TranslationInput =
      typeof input === "string"
        ? { title: input, description: description ?? "", approved: true }
        : input;
    if (!values.title?.trim() || !values.description?.trim()) {
      throw new BadRequestException("Translation title and description are required");
    }
    const now = new Date();
    const data = {
      title: values.title.trim(),
      description: values.description.trim(),
      approved: true,
      approvedAt: now,
      approvedBy: actorId,
    };
    const key = `${propertyId}:${normalizedLocale}`;
    const stored = this.prisma.propertyTranslation?.upsert
      ? await this.prisma.propertyTranslation.upsert({
          where: { propertyId_locale: { propertyId, locale: normalizedLocale } },
          create: { propertyId, locale: normalizedLocale, ...data },
          update: data,
        })
      : { id: key, propertyId, locale: normalizedLocale, ...data };
    this.local.set(key, stored);
    return stored;
  }

  async queueTranslation(
    propertyId: string,
    locale: string,
    input: TranslationInput,
    actorId?: string,
  ) {
    const normalizedLocale = this.locale(locale);
    if (!input.title?.trim() || !input.description?.trim()) {
      throw new BadRequestException("Translation title and description are required");
    }
    const data = {
      title: input.title.trim(),
      description: input.description.trim(),
      approved: false,
      approvedAt: null,
      approvedBy: actorId,
    };
    const key = `${propertyId}:${normalizedLocale}`;
    const stored = this.prisma.propertyTranslation?.upsert
      ? await this.prisma.propertyTranslation.upsert({
          where: { propertyId_locale: { propertyId, locale: normalizedLocale } },
          create: { propertyId, locale: normalizedLocale, ...data },
          update: data,
        })
      : { id: key, propertyId, locale: normalizedLocale, ...data };
    this.local.set(key, stored);
    return stored;
  }

  async getTranslation(propertyId: string, locale: string) {
    const normalizedLocale = this.locale(locale);
    const key = `${propertyId}:${normalizedLocale}`;
    if (this.prisma.propertyTranslation?.findUnique) {
      const row = await this.prisma.propertyTranslation.findUnique({
        where: { propertyId_locale: { propertyId, locale: normalizedLocale } },
      });
      if (row) {
        this.local.set(key, row);
        return row.approved ? row : null;
      }
    }
    const cached = this.local.get(key);
    return cached?.approved ? cached : null;
  }

  async getPublicContent(propertyId: string, locale: string) {
    const localized = await this.getTranslation(propertyId, locale);
    if (localized) return localized;
    return this.getTranslation(propertyId, "en");
  }

  /** Locales with approved content are the only locales eligible for SEO alternates. */
  async getApprovedLocales(propertyId: string): Promise<string[]> {
    if (this.prisma.propertyTranslation?.findMany) {
      const rows = await this.prisma.propertyTranslation.findMany({
        where: { propertyId, approved: true },
        select: { locale: true },
      });
      return ["en", ...((rows ?? []).map((row: { locale: string }) => row.locale))]
        .map((locale) => locale.toLowerCase().split("-")[0])
        .filter((locale, index, all) => all.indexOf(locale) === index);
    }
    return ["en", ...[...this.local.values()]
      .filter((entry) => entry.propertyId === propertyId && entry.approved)
      .map((entry) => entry.locale)];
  }

  async listPending() {
    if (!this.prisma.propertyTranslation?.findMany) {
      return [...this.local.values()].filter((entry) => !entry.approved);
    }
    return this.prisma.propertyTranslation.findMany({
      where: { approved: false },
      include: { property: true },
      orderBy: { createdAt: "asc" },
    });
  }

  private locale(value: string) {
    const normalized = value.toLowerCase().replace("_", "-").split("-")[0];
    if (normalized !== "en" && normalized !== "ti") {
      throw new BadRequestException("Only English and Tigrinya translations are supported");
    }
    return normalized;
  }
}
