import { PropertyForm } from "../../../../../../features/properties/property-form";

export default async function EditOwnerPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="portal-card property-card">
      <p className="eyebrow">Owner submission</p>
      <h2>Edit your draft</h2>
      <PropertyForm propertyId={id} />
    </div>
  );
}
