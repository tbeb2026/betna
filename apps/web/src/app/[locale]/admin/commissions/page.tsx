import { AdminCommissionActions } from "../../../../features/commissions/admin-commission-actions";
import { createApiClient } from "../../../../lib/api-client";
import { requireRole } from "../../../../lib/auth";
import { getTranslations } from "next-intl/server";

export default async function AdminCommissionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireRole("ADMIN", locale);
  const t = await getTranslations({ locale, namespace: "portal.admin" });
  const statusT = await getTranslations({ locale, namespace: "portal.statuses" });
  const api = createApiClient({ token: session.token });
  const [commissions, conversions] = await Promise.all([
    api.get<any[]>("/admin/commissions").catch(() => []),
    api.get<any[]>("/admin/conversions").catch(() => []),
  ]);
  return (
    <div className="portal-card">
      <h2>{t("commissionTitle")}</h2>
      <p>{t("commissionDescription")}</p>
      {conversions.length ? (
        <div className="property-list">
          {conversions.map((conversion) => (
            <article className="property-list-item" key={conversion.id}>
              <div>
                <p className="eyebrow">{t("conversion")} {statusT.has(conversion.status) ? statusT(conversion.status) : statusT("UNPUBLISHED")}</p>
                <h3>{conversion.inquiry?.reference ?? conversion.inquiryId}</h3>
                <p>{conversion.firstPaymentCurrency} {conversion.firstPaymentAmount ?? "—"} · {conversion.owner?.email ?? conversion.ownerId}</p>
              </div>
              <AdminCommissionActions conversionId={conversion.id} conversionStatus={conversion.status} commission={conversion.commission} />
            </article>
          ))}
        </div>
      ) : commissions.length ? (
        <div className="property-list">
          {commissions.map((commission) => (
            <article className="property-list-item" key={commission.id}>
              <div><p className="eyebrow">{statusT.has(commission.status) ? statusT(commission.status) : statusT("UNPUBLISHED")}</p><h3>{commission.currency} {commission.amountDue}</h3><p>{commission.percentage}% {t("firstPayment")}</p></div>
              <AdminCommissionActions conversionId={commission.conversionId} conversionStatus={commission.conversion?.status ?? "VERIFIED"} commission={commission} />
            </article>
          ))}
        </div>
      ) : <p className="form-help">{t("emptyCommissions")}</p>}
    </div>
  );
}
