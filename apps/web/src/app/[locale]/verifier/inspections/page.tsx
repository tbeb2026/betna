import { Link } from "../../../../i18n/navigation";
import { getVerifierInspections } from "../../../../features/verification/verification-data";
import { getTranslations } from "next-intl/server";

export default async function VerifierInspectionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.verifier" });
  const statusT = await getTranslations({ locale, namespace: "portal.statuses" });
  const categoryT = await getTranslations({ locale, namespace: "portal.categories" });
  const inspections = await getVerifierInspections();
  return (
    <div className="portal-card">
      <p className="eyebrow">{t("territoryQueue")}</p>
      <h2>{t("assignedInspections")}</h2>
      <p className="form-help">{t("territoryHelp")}</p>
      {inspections.length ? (
        <div className="property-list">
          {inspections.map((inspection) => (
            <article className="property-list-item" key={inspection.id}>
              <div>
                <p className="eyebrow">{statusT.has(inspection.status) ? statusT(inspection.status) : statusT("UNPUBLISHED")}</p>
                <h3>{inspection.property?.title ?? inspection.id}</h3>
                <p className="form-help">
                  {inspection.property?.category && categoryT.has(inspection.property.category.toLowerCase()) ? categoryT(inspection.property.category.toLowerCase()) : t("propertyInspection")}
                </p>
              </div>
              <Link
                className="button primary"
                href={`/verifier/inspections/${inspection.id}`}
              >{t("openInspection")}</Link>
            </article>
          ))}
        </div>
      ) : (
        <p className="form-help">{t("empty")}</p>
      )}
    </div>
  );
}
