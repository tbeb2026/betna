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
    getOwnerProperty(id),
    getSession(),
  ]);
  return (
    <div className="portal-card property-card">
      <p className="eyebrow">Owner submission</p>
      <h2>Edit your draft</h2>
      <PropertyForm
        propertyId={id}
        options={options}
        initialProperty={property}
      />
      <MediaUploader propertyId={id} authToken={session?.token} />
    </div>
  );
}
