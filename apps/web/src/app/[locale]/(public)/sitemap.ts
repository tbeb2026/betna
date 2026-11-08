import type { MetadataRoute } from "next";
import { getAllPublicProperties } from "../../../features/search/data";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export function buildSitemapEntries(properties: Array<{ slug: string; availableLocales?: string[]; location?: { country?: string; city?: string }; verification?: { validUntil?: string | null } }>, origin = siteUrl): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [
    { url: `${origin}/en/search`, changeFrequency: "daily", priority: 0.8 },
    { url: `${origin}/ti/search`, changeFrequency: "daily", priority: 0.8 },
  ];
  const seen = new Set(entries.map((entry) => String(entry.url)));
  const add = (entry: MetadataRoute.Sitemap[number]) => { if (!seen.has(String(entry.url))) { seen.add(String(entry.url)); entries.push(entry); } };
  for (const property of properties) {
    for (const locale of property.availableLocales ?? ["en"]) add({ url: `${origin}/${locale}/property/${encodeURIComponent(property.slug)}`, lastModified: property.verification?.validUntil ? new Date(property.verification.validUntil) : undefined, changeFrequency: "weekly", priority: 0.7 });
    if (!property.location?.country || !property.location.city) continue;
    const city = property.location.city.toLowerCase().replaceAll(" ", "-");
    const country = property.location.country.toLowerCase();
    for (const locale of property.availableLocales ?? ["en"]) add({ url: `${origin}/${locale}/${country}/${city}`, changeFrequency: "daily", priority: 0.75 });
  }
  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries(await getAllPublicProperties({ locale: "en" }));
}
