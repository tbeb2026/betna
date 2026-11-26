import { PropertyForm } from "../../../../../../features/properties/property-form";
import { MediaUploader } from "../../../../../../features/media/uploader";
import { getSession } from "../../../../../../lib/auth";
import {
  getOwnerProperty,
  getOwnerPropertyOptions,
} from "../../../../../../features/properties/owner-properties";
import { getTranslations } from "next-intl/server";

export default async function EditOwnerPropertyPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.propertyForm" });
  const [options, property, session] = await Promise.all([
    getOwnerPropertyOptions(),
    getOwnerProperty<{ status?: string }>(id),
    getSession(),
  ]);
  return (
    <div className="portal-card property-card">
      <p className="eyebrow">{t("ownerSubmission")}</p>
      <h2>{property?.status === "DRAFT" ? t("editDraft") : t("requestEdit")}</h2>
      {property?.status !== "DRAFT" ? <p className="form-help">{t("materialEditHelp")}</p> : null}
      <PropertyForm
        propertyId={id}
        options={options}
        initialProperty={property}
      />
      <MediaUploader propertyId={id} />
    </div>
  );
}
