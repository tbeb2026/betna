import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicProperty } from "../../../../../features/search/data";
import { Link } from "../../../../../i18n/navigation";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
function canonical(locale: string, slug: string) { return `${siteUrl}/${locale}/property/${encodeURIComponent(slug)}`; }

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const property = await getPublicProperty(slug, locale);
  if (!property) return { title: "Property not found | Betna" };
  const languages = Object.fromEntries((property.availableLocales ?? ["en"]).map((item) => [item, canonical(item, slug)]));
  return { title: `${property.title} | Betna`, description: property.description, alternates: { canonical: canonical(locale, slug), languages }, openGraph: { title: property.title, description: property.description, url: canonical(locale, slug), type: "website" } };
}

export default async function PropertyPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const property = await getPublicProperty(slug, locale);
  if (!property) notFound();
  return (
    <article className="property-detail">
      <Link href="/search" className="back-link">← Back to discovery</Link>
      <p className="eyebrow">{property.category.replaceAll("_", " ")}</p><h1>{property.title}</h1>
      <p className="property-location">{property.location.label} · {property.location.city}</p>
      <div className="map-summary" data-latitude={property.location.latitude} data-longitude={property.location.longitude}>Approximate location near {property.location.label}</div>
      <p className="property-description">{property.description}</p>
      <section aria-labelledby="property-offerings"><h2 id="property-offerings">Rental options</h2><div className="offering-grid">{property.offerings.map((offering) => <div className="offering-card" key={`${offering.mode}-${offering.currency}`}><h3>{offering.mode === "LONG_TERM" ? "Long-term" : "Short-stay"}</h3><strong>{offering.currency} {offering.basePrice.toLocaleString()}</strong>{offering.minimumNights ? <span>Minimum {offering.minimumNights} nights</span> : null}{offering.leaseDurationMonths ? <span>{offering.leaseDurationMonths}-month lease</span> : null}</div>)}</div></section>
      <section aria-labelledby="property-verification"><h2 id="property-verification">Betna verification</h2><p>{property.verification?.badge ?? "VERIFIED_BY_BETNA"}. Exact address is protected while Betna manages contact.</p></section>
    </article>
  );
}
