import { PropertyForm } from "../../../../../features/properties/property-form";
import { getOwnerPropertyOptions } from "../../../../../features/properties/owner-properties";

export default async function NewOwnerPropertyPage() {
  const options = await getOwnerPropertyOptions();
  return (
    <div className="portal-card property-card">
      <p className="eyebrow">Owner submission</p>
      <h2>List a place</h2>
      <p className="form-help">
        Tell us about your place. Your exact address is private and used for
        verification.
      </p>
      <PropertyForm options={options} />
    </div>
  );
}
