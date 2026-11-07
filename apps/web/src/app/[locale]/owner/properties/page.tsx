import { Link } from "../../../../i18n/navigation";

export default function OwnerPropertiesPage() {
  return (
    <div className="portal-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Owner listings</p>
          <h2>Your places</h2>
        </div>
        <Link className="button primary" href="/owner/properties/new">List a place</Link>
      </div>
      <p className="form-help">Create a draft for each place you own. Betna reviews every submission before it appears publicly.</p>
    </div>
  );
}
