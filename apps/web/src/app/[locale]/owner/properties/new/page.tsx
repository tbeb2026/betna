import { PropertyForm } from "../../../../../features/properties/property-form";
import { getOwnerPropertyOptions } from "../../../../../features/properties/owner-properties";
import { getTranslations } from "next-intl/server";

export default async function NewOwnerPropertyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.propertyForm" });
  const options = await getOwnerPropertyOptions();
  return (
    <div className="portal-card property-card">
      <p className="eyebrow">{t("ownerSubmission")}</p>
      <h2>{t("listPlace")}</h2>
      <p className="form-help">{t("submissionHelp")}</p>
      <PropertyForm options={options} />
    </div>
  );
}
