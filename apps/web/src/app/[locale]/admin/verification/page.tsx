import { AdminReviewActions } from "../../../../features/verification/admin-review-actions";
import { getAdminReviewQueue } from "../../../../features/verification/verification-data";
import { getSession } from "../../../../lib/auth";
import { getTranslations } from "next-intl/server";

export default async function AdminVerificationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.admin" });
  const categoryT = await getTranslations({ locale, namespace: "portal.categories" });
  const [queue, session] = await Promise.all([getAdminReviewQueue(), getSession()]);
  return (
    <div className="portal-card">
      <p className="eyebrow">{t("verificationEyebrow")}</p>
      <h2>{t("verificationTitle")}</h2>
      <p className="form-help">{t("verificationDescription")}</p>
      {queue.length ? (
        <div className="property-list">
          {queue.map((inspection) => (
            <article className="property-list-item" key={inspection.id}>
              <div>
                <p className="eyebrow">{t("readyForReview")}</p>
                <h3>{inspection.property?.title ?? inspection.id}</h3>
                <p className="form-help">{inspection.property?.category && categoryT.has(inspection.property.category.toLowerCase()) ? categoryT(inspection.property.category.toLowerCase()) : t("verificationEyebrow")}</p>
              </div>
              <AdminReviewActions inspectionId={inspection.id} />
            </article>
          ))}
        </div>
      ) : <p className="form-help">{t("emptyVerification")}</p>}
    </div>
  );
}
