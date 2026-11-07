import { Link } from "../../../i18n/navigation";

export default function OwnerPage() {
  return (
    <div className="portal-card">
      <h2>Listings</h2>
      <p>Your places and review progress will appear here.</p>
      <div className="actions"><Link className="button primary" href="/owner/properties">Manage places</Link></div>
    </div>
  );
}
