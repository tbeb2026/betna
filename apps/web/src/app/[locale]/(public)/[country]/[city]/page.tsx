import type { Metadata } from "next";
import { getPublicProperties } from "../../../../../features/search/data";
import { PropertyCard } from "../../../../../features/search/property-card";
import { canonicalLocale, collectionJsonLd, collectionMetadata, jsonLd, siteUrl } from "../../../../../features/search/seo";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; country: string; city: string }> }): Promise<Metadata> {
  const { locale, country, city } = await params;
  const properties = await getPublicProperties({ locale, country, city });
  const cityName = city.replaceAll("-", " ");
  const t = await getTranslations({ locale, namespace: "search.page" });
  return collectionMetadata(locale, `/${country}/${city}`, properties, t("cityTitle", { city: cityName }), t("cityDescription"));
}

export default async function CityPage({ params }: { params: Promise<{ locale: string; country: string; city: string }> }) {
  const { locale, country, city } = await params;
  const properties = await getPublicProperties({ locale, country, city });
  const t = await getTranslations({ locale, namespace: "search.page" });
  const cityName = city.replaceAll("-", " ");
  return (
    <section className="search-page">
      {jsonLd(collectionJsonLd(`${siteUrl}/${canonicalLocale(locale, properties)}/${country}/${city}`, t("cityTitle", { city }), properties))}
      <div className="search-intro"><p className="eyebrow">{country.toUpperCase()}</p><h1>{t("cityTitle", { city: cityName })}</h1><p className="lede">{t("cityDescription")}</p></div>
      {properties.length ? <div className="property-grid">{properties.map((property) => <PropertyCard key={property.id} property={property} />)}</div> : <p className="empty-state">{t("cityEmpty")}</p>}
    </section>
  );
}
