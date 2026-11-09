import { PropertyForm } from "../../../../../../features/properties/property-form";
import { MediaUploader } from "../../../../../../features/media/uploader";
import { getSession } from "../../../../../../lib/auth";
import {
  getOwnerProperty,
  getOwnerPropertyOptions,
} from "../../../../../../features/properties/owner-properties";

export default async function EditOwnerPropertyPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const [options, property, session] = await Promise.all([
    getOwnerPropertyOptions(),
    getOwnerProperty<{ status?: string }>(id),
    getSession(),
  ]);
  return (
    <div className="portal-card property-card">
      <p className="eyebrow">Owner submission</p>
      <h2>{property?.status === "DRAFT" ? "Edit your draft" : "Request a listing edit"}</h2>
      {property?.status !== "DRAFT" ? <p className="form-help">Material changes remain under review while the last approved listing stays public.</p> : null}
      <PropertyForm
        propertyId={id}
        options={options}
        initialProperty={property}
      />
      <MediaUploader propertyId={id} />
    </div>
  );
}
