import { AdminCommissionActions } from "../../../../features/commissions/admin-commission-actions";
import { createApiClient } from "../../../../lib/api-client";
import { requireRole } from "../../../../lib/auth";

export default async function AdminCommissionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireRole("ADMIN", locale);
  const api = createApiClient({ token: session.token });
  const [commissions, conversions] = await Promise.all([
    api.get<any[]>("/admin/commissions").catch(() => []),
    api.get<any[]>("/admin/conversions").catch(() => []),
  ]);
  return (
    <div className="portal-card">
      <h2>Commission ledger</h2>
      <p>Verify first-payment evidence, mark a commission due, then record payment or a reviewed exception.</p>
      {conversions.length ? (
        <div className="property-list">
          {conversions.map((conversion) => (
            <article className="property-list-item" key={conversion.id}>
              <div>
                <p className="eyebrow">Conversion {conversion.status}</p>
                <h3>{conversion.inquiry?.reference ?? conversion.inquiryId}</h3>
                <p>{conversion.firstPaymentCurrency} {conversion.firstPaymentAmount ?? "—"} · {conversion.owner?.email ?? conversion.ownerId}</p>
              </div>
              <AdminCommissionActions conversionId={conversion.id} conversionStatus={conversion.status} commission={conversion.commission} token={session.token ?? ""} />
            </article>
          ))}
        </div>
      ) : commissions.length ? (
        <div className="property-list">
          {commissions.map((commission) => (
            <article className="property-list-item" key={commission.id}>
              <div><p className="eyebrow">{commission.status}</p><h3>{commission.currency} {commission.amountDue}</h3><p>{commission.percentage}% of first payment</p></div>
              <AdminCommissionActions conversionId={commission.conversionId} conversionStatus={commission.conversion?.status ?? "VERIFIED"} commission={commission} token={session.token ?? ""} />
            </article>
          ))}
        </div>
      ) : <p className="form-help">No conversion or commission records yet.</p>}
    </div>
  );
}
