import { Link } from "../../i18n/navigation";
import { useTranslations } from "next-intl";

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
  offerings: Array<{ id?: string; mode: "SHORT_STAY" | "LONG_TERM" | string; currency: string; basePrice: number; negotiable?: boolean; minimumNights?: number | null; leaseDurationMonths?: number | null }>;
  media: Array<{ id: string; objectKey: string; url?: string }>;
  verification?: { badge?: string; validUntil?: string | null };
};

function price(property: PublicProperty, onRequest: string) {
  const offering = property.offerings[0];
  if (!offering) return onRequest;
  return `${offering.currency} ${offering.basePrice.toLocaleString()}`;
}

export function PropertyCard({ property }: { property: PublicProperty }) {
  const t = useTranslations("publicProperty");
  const categoryKey = property.category.toLowerCase();
  const category = t.has(`categories.${categoryKey}`) ? t(`categories.${categoryKey}`) : t("verifiedPlace");
  const badgeKey = String(property.verification?.badge ?? "VERIFIED_BY_BETNA").toUpperCase();
  const badge = t.has(`badges.${badgeKey}`) ? t(`badges.${badgeKey}`) : t("verifiedByBetna");
  return (
    <article className="portal-card property-card" data-testid="property-card">
      <div className="property-card-media" aria-hidden="true">
        {property.media[0] ? (
          <img
            src={property.media[0].url ?? property.media[0].objectKey}
            alt=""
            loading="lazy"
          />
        ) : <span>{t("verifiedPlace")}</span>}
      </div>
      <div className="section-heading">
        <div><p className="eyebrow">{category}</p><h2>{property.title}</h2></div>
        <span className="verification-badge">{badge}</span>
      </div>
      <p className="form-help">{property.location.label} · {property.location.city ?? property.location.country}</p>
      <p>{property.description}</p>
      <div className="property-card-meta"><strong>{price(property, t("priceOnRequest"))}</strong><span>{property.offerings[0]?.mode === "LONG_TERM" ? t("longTerm") : t("shortStay")}</span></div>
      <div className="actions"><Link className="button primary" href={`/property/${property.slug}`}>{t("viewProperty")}</Link></div>
    </article>
  );
}
