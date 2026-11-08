import type { MetadataRoute } from "next";
import { getPublicProperties } from "../../../features/search/data";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
export function buildSitemapEntries(properties: Array<{ slug: string; availableLocales?: string[]; verification?: { validUntil?: string | null } }>, origin = siteUrl): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [{ url: `${origin}/en/search`, changeFrequency: "daily", priority: 0.8 }];
  for (const property of properties) for (const locale of property.availableLocales ?? ["en"]) entries.push({ url: `${origin}/${locale}/property/${encodeURIComponent(property.slug)}`, lastModified: property.verification?.validUntil ? new Date(property.verification.validUntil) : undefined, changeFrequency: "weekly", priority: 0.7 });
  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries(await getPublicProperties({ locale: "en" }));
}
