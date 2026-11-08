import { Link } from "../../i18n/navigation";

export type PublicProperty = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  subcategory?: string | null;
  status: string;
  locale?: string;
  availableLocales?: string[];
  location: { country?: string; city?: string; neighborhood?: string; label: string; latitude: number; longitude: number };
  offerings: Array<{ mode: "SHORT_STAY" | "LONG_TERM" | string; currency: string; basePrice: number; negotiable?: boolean; minimumNights?: number | null; leaseDurationMonths?: number | null }>;
  media: Array<{ id: string; objectKey: string }>;
  verification?: { badge?: string; validUntil?: string | null };
};

function price(property: PublicProperty) {
  const offering = property.offerings[0];
  if (!offering) return "Price on request";
  return `${offering.currency} ${offering.basePrice.toLocaleString()}`;
}

export function PropertyCard({ property }: { property: PublicProperty }) {
  return (
    <article className="portal-card property-card" data-testid="property-card">
      <div className="property-card-media" aria-hidden="true">
        {property.media[0] ? <span>{property.media[0].objectKey}</span> : <span>Betna verified place</span>}
      </div>
      <div className="section-heading">
        <div><p className="eyebrow">{property.category.replaceAll("_", " ")}</p><h2>{property.title}</h2></div>
        <span className="verification-badge">{property.verification?.badge ?? "VERIFIED_BY_BETNA"}</span>
      </div>
      <p className="form-help">{property.location.label} · {property.location.city ?? property.location.country}</p>
      <p>{property.description}</p>
      <div className="property-card-meta"><strong>{price(property)}</strong><span>{property.offerings[0]?.mode === "LONG_TERM" ? "Long-term" : "Short-stay"}</span></div>
      <div className="actions"><Link className="button primary" href={`/property/${property.slug}`}>View property</Link></div>
    </article>
  );
}
