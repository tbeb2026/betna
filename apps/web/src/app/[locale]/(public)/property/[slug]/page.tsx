import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicProperty } from "../../../../../features/search/data";
import { Link } from "../../../../../i18n/navigation";
import { PropertyOfferings } from "../../../../../features/search/property-offerings";
import { jsonLd, siteUrl } from "../../../../../features/search/seo";

function canonical(locale: string, slug: string) { return `${siteUrl}/${locale}/property/${encodeURIComponent(slug)}`; }

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const property = await getPublicProperty(slug, locale);
  if (!property) return { title: "Property not found | Betna" };
  const resolvedLocale = property.locale ?? "en";
  const languages = Object.fromEntries((property.availableLocales ?? ["en"]).map((item) => [item, canonical(item, slug)]));
  return { title: `${property.title} | Betna`, description: property.description, alternates: { canonical: canonical(resolvedLocale, slug), languages }, openGraph: { title: property.title, description: property.description, url: canonical(resolvedLocale, slug), type: "website" } };
}

export default async function PropertyPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const property = await getPublicProperty(slug, locale);
  if (!property) notFound();
  return (
    <article className="property-detail">
      {jsonLd({ "@context": "https://schema.org", "@type": "LodgingBusiness", name: property.title, description: property.description, url: canonical(property.locale ?? "en", slug), address: { "@type": "PostalAddress", addressLocality: property.location.city, addressCountry: property.location.country } })}
      <Link href="/search" className="back-link">← Back to discovery</Link>
      <p className="eyebrow">{property.category.replaceAll("_", " ")}</p><h1>{property.title}</h1>
      <p className="property-location">{property.location.label} · {property.location.city}</p>
      <div className="map-summary" data-latitude={property.location.latitude} data-longitude={property.location.longitude}>Approximate location near {property.location.label}</div>
      <p className="property-description">{property.description}</p>
      <section aria-labelledby="property-offerings"><h2 id="property-offerings">Rental options</h2><PropertyOfferings offerings={property.offerings} /></section>
      <section aria-labelledby="property-verification"><h2 id="property-verification">Betna verification</h2><p>{property.verification?.badge ?? "VERIFIED_BY_BETNA"}. Exact address is protected while Betna manages contact.</p></section>
    </article>
  );
}
