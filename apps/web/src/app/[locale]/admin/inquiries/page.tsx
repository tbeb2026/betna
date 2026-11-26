import { createApiClient } from "../../../../lib/api-client";
import { getSession } from "../../../../lib/auth";
import { AdminLocationActions } from "../../../../features/inquiries/admin-location-actions";
import { getTranslations } from "next-intl/server";

export default async function AdminInquiriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.adminInquiries" });
  const statusT = await getTranslations({ locale, namespace: "portal.statuses" });
  const session = await getSession();
  const inquiries = session ? await createApiClient({ token: session.token }).get<any[]>("/admin/inquiries").catch(() => []) : [];
  return (
    <div className="portal-card">
      <p className="eyebrow">{t("eyebrow")}</p>
      <h2>{t("title")}</h2>
      <p className="form-help">{t("description")}</p>
      {inquiries.length ? <div className="property-list">{inquiries.map((inquiry) => <article className="property-list-item" key={inquiry.id}><div><p className="eyebrow">{statusT.has(inquiry.status) ? statusT(inquiry.status) : statusT("UNPUBLISHED")}</p><h3>{inquiry.reference}</h3><p>{inquiry.property?.title ?? t("propertyFallback")}</p></div>{session ? <AdminLocationActions inquiryId={inquiry.id} status={inquiry.status} /> : null}</article>)}</div> : <p className="form-help">{t("empty")}</p>}
    </div>
  );
}
