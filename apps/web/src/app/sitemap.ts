import type { MetadataRoute } from "next";
import { getPublicProperties } from "../features/search/data";
import { buildSitemapEntries } from "./[locale]/(public)/sitemap";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries(await getPublicProperties({ locale: "en" }));
}
