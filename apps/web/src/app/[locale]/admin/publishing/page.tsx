import { cookies } from "next/headers";
import { createApiClient } from "../../../../lib/api-client";
import { getTranslations } from "next-intl/server";
import { AdminPublishingActions } from "../../../../features/publishing/admin-publishing-actions";

type QueueItem = {
  id: string;
  title: string;
  status: string;
  category?: string;
  verificationValidUntil?: string;
};

async function getQueue(): Promise<QueueItem[]> {
  const token = (await cookies()).get("betna_session")?.value;
  if (!token) return [];
  try {
    return await createApiClient({
      token,
      baseUrl: process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL,
    }).get<QueueItem[]>("/admin/publishing");
  } catch {
    return [];
  }
}

export default async function AdminPublishingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.admin" });
  const statusT = await getTranslations({
    locale,
    namespace: "portal.statuses",
  });
  const categoryT = await getTranslations({
    locale,
    namespace: "portal.categories",
  });
  const queue = await getQueue();
  return (
    <div className="portal-card">
      <p className="eyebrow">{t("publishingEyebrow")}</p>
      <h2>{t("publishingTitle")}</h2>
      <p className="form-help">{t("publishingDescription")}</p>
      {queue.length ? (
        <div className="property-list">
          {queue.map((property) => (
            <article className="property-list-item" key={property.id}>
              <div>
                <p className="eyebrow">
                  {statusT.has(property.status)
                    ? statusT(property.status)
                    : statusT("UNPUBLISHED")}
                </p>
                <h3>{property.title}</h3>
                <p className="form-help">
                  {property.category &&
                  categoryT.has(property.category.toLowerCase())
                    ? categoryT(property.category.toLowerCase())
                    : categoryT("other")}
                </p>
              </div>
              <div>
                <span className="form-help">
                  {property.verificationValidUntil
                    ? t("verifiedUntil", {
                        date: new Date(
                          property.verificationValidUntil,
                        ).toLocaleDateString(locale),
                      })
                    : t("needsVerification")}
                </span>
                <AdminPublishingActions
                  propertyId={property.id}
                  status={property.status}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="form-help">{t("emptyPublishing")}</p>
      )}
    </div>
  );
}
