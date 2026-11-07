import { Link } from "../../../../i18n/navigation";
import { getOwnerProperties } from "../../../../features/properties/owner-properties";

type OwnerProperty = {
  id: string;
  title: string;
  status: string;
  city?: { name: string };
  publicLocationLabel?: string;
  offerings?: Array<{
    mode: string;
    currency: string;
    basePrice: number | string;
  }>;
};

export default async function OwnerPropertiesPage() {
  const properties = await getOwnerProperties<OwnerProperty>();
  return (
    <div className="portal-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Owner listings</p>
          <h2>Your places</h2>
        </div>
        <Link className="button primary" href="/owner/properties/new">
          List a place
        </Link>
      </div>
      {properties.length === 0 ? (
        <p className="form-help">
          Create a draft for each place you own. Betna reviews every submission
          before it appears publicly.
        </p>
      ) : (
        <div className="property-list">
          {properties.map((property) => (
            <article className="property-list-item" key={property.id}>
              <div>
                <p className="eyebrow">
                  {property.status.replaceAll("_", " ")}
                </p>
                <h3>{property.title}</h3>
                <p className="form-help">
                  {property.city?.name ??
                    property.publicLocationLabel ??
                    "Managed location"}
                </p>
              </div>
              {property.status === "DRAFT" ? (
                <Link
                  className="button secondary"
                  href={`/owner/properties/${property.id}/edit`}
                >
                  Edit draft
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
