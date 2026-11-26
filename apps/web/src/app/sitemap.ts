import type { MetadataRoute } from "next";
import { getAllPublicProperties } from "../features/search/data";
import { buildSitemapEntries } from "./[locale]/(public)/sitemap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries(await getAllPublicProperties({ locale: "en" }));
}
