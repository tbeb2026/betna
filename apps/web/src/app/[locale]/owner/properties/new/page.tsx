import { PropertyForm } from "../../../../../features/properties/property-form";

export default function NewOwnerPropertyPage() {
  return (
    <div className="portal-card property-card">
      <p className="eyebrow">Owner submission</p>
      <h2>List a place</h2>
      <p className="form-help">Tell us about your place. Your exact address is private and used for verification.</p>
      <PropertyForm />
    </div>
  );
}
