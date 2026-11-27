import type { Metadata } from "next";
import { Filters, type SearchFilterValues } from "../../../../features/search/filters";
import { getPublicProperties } from "../../../../features/search/data";
import { PropertyCard } from "../../../../features/search/property-card";
import { canonicalLocale, collectionJsonLd, collectionMetadata, jsonLd, siteUrl } from "../../../../features/search/seo";
import { getTranslations } from "next-intl/server";

// Listings come from the API. Rendering this route dynamically prevents image
// builds from depending on the availability of the public API.
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const properties = await getPublicProperties({ locale });
  const t = await getTranslations({ locale, namespace: "search.page" });
  return collectionMetadata(locale, "/search", properties, t("title"), t("description"));
}

export default async function SearchPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> }) {
  const { locale } = await params;
  const raw = await searchParams;
  const t = await getTranslations({ locale, namespace: "search.page" });
  const values: SearchFilterValues = { country: first(raw.country), city: first(raw.city), category: first(raw.category), minPrice: first(raw.minPrice), maxPrice: first(raw.maxPrice), mode: first(raw.mode) };
  const properties = await getPublicProperties({ ...values, locale });
  return (
    <section className="search-page">
      {jsonLd(collectionJsonLd(`${siteUrl}/${canonicalLocale(locale, properties)}/search`, t("title"), properties))}
      <div className="search-intro"><p className="eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1><p className="lede">{t("description")}</p></div>
      <Filters locale={locale} values={values} />
      <div className="map-summary" aria-label={t("mapLabel")}><span>{t("mapLabel")}</span><span>{t("mapDescription")}</span></div>
      {properties.length ? <div className="property-grid">{properties.map((property) => <PropertyCard key={property.id} property={property} />)}</div> : <p className="empty-state">{t("empty")}</p>}
    </section>
  );
}
