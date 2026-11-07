import { Link } from "../../../../i18n/navigation";

export default function VerifierInspectionsPage() {
  return (
    <div className="portal-card">
      <p className="eyebrow">Territory queue</p>
      <h2>Assigned inspections</h2>
      <p className="form-help">
        Only inspections assigned within your territory are shown.
      </p>
      <Link
        className="button primary"
        href="/verifier/inspections/inspection-1"
      >
        Open inspection
      </Link>
    </div>
  );
}
