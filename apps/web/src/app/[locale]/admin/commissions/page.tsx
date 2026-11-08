import { createApiClient } from "../../../../lib/api-client";
import { requireRole } from "../../../../lib/auth";

export default async function AdminCommissionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireRole("ADMIN", locale);
  const commissions = await createApiClient({ token: session.token }).get<any[]>("/admin/commissions").catch(() => []);
  return (
    <div className="portal-card">
      <h2>Commission ledger</h2>
      <p>Verify first-payment evidence before marking an owner commission due.</p>
      {commissions.length ? (
        <div className="property-list">
          {commissions.map((commission) => (
            <article className="property-list-item" key={commission.id}>
              <div><p className="eyebrow">{commission.status}</p><h3>{commission.currency} {commission.amountDue}</h3><p>{commission.percentage}% of first payment</p></div>
            </article>
          ))}
        </div>
      ) : <p className="form-help">No commission records yet.</p>}
    </div>
  );
}
