import { Link } from "../../../../i18n/navigation";
import { getVerifierInspections } from "../../../../features/verification/verification-data";

export default async function VerifierInspectionsPage() {
  const inspections = await getVerifierInspections();
  return (
    <div className="portal-card">
      <p className="eyebrow">Territory queue</p>
      <h2>Assigned inspections</h2>
      <p className="form-help">
        Only inspections assigned within your territory are shown.
      </p>
      {inspections.length ? (
        <div className="property-list">
          {inspections.map((inspection) => (
            <article className="property-list-item" key={inspection.id}>
              <div>
                <p className="eyebrow">{inspection.status.replaceAll("_", " ")}</p>
                <h3>{inspection.property?.title ?? inspection.id}</h3>
                <p className="form-help">
                  {inspection.property?.category ?? "Property inspection"}
                </p>
              </div>
              <Link
                className="button primary"
                href={`/verifier/inspections/${inspection.id}`}
              >
                Open inspection
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <p className="form-help">No inspections are assigned in your territories.</p>
      )}
    </div>
  );
}
