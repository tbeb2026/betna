import { Link } from "../../../../i18n/navigation";
import { getOwnerProperties } from "../../../../features/properties/owner-properties";
import { getTranslations } from "next-intl/server";

type OwnerProperty = {
  id: string;
  title: string;
  status: string;
  city?: { name: string };
  publicLocationLabel?: string;
  offerings?: Array<{
    mode: string;
    currency: string;
    basePrice: number | string;
  }>;
};

export default async function OwnerPropertiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.ownerListings" });
  const statusT = await getTranslations({ locale, namespace: "portal.statuses" });
  const properties = await getOwnerProperties<OwnerProperty>();
  return (
    <div className="portal-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h2>{t("title")}</h2>
        </div>
        <Link className="button primary" href="/owner/properties/new">
          {t("listPlace")}
        </Link>
      </div>
      {properties.length === 0 ? (
        <p className="form-help">
          {t("empty")}
        </p>
      ) : (
        <div className="property-list">
          {properties.map((property) => (
            <article className="property-list-item" key={property.id}>
              <div>
                <p className="eyebrow">
                  {statusT.has(property.status) ? statusT(property.status) : property.status.replaceAll("_", " ")}
                </p>
                <h3>{property.title}</h3>
                <p className="form-help">
                  {property.city?.name ??
                    property.publicLocationLabel ??
                    t("managedLocation")}
                </p>
              </div>
              {!["REJECTED", "FRAUD_REVIEW"].includes(property.status) ? (
                <Link
                  className="button secondary"
                  href={`/owner/properties/${property.id}/edit`}
                >
                  {property.status === "DRAFT" ? t("editDraft") : t("requestEdit")}
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
