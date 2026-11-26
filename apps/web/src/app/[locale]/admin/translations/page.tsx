import { cookies } from "next/headers";
import { createApiClient } from "../../../../lib/api-client";
import { getTranslations } from "next-intl/server";

type PendingTranslation = {
  id: string;
  propertyId: string;
  locale: string;
  title: string;
  description: string;
  property?: { title?: string };
};

async function getPending(): Promise<PendingTranslation[]> {
  const token = (await cookies()).get("betna_session")?.value;
  if (!token) return [];
  try {
    return await createApiClient({ token, baseUrl: process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL }).get<PendingTranslation[]>("/admin/translations");
  } catch {
    return [];
  }
}

export default async function AdminTranslationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.admin" });
  const pending = await getPending();
  return (
    <div className="portal-card">
      <p className="eyebrow">{t("translationsEyebrow")}</p>
      <h2>{t("translationsTitle")}</h2>
      <p className="form-help">{t("translationsDescription")}</p>
      {pending.length ? (
        <div className="property-list">
          {pending.map((translation) => (
            <article className="property-list-item" key={translation.id}>
              <div>
                <p className="eyebrow">{translation.locale}</p>
                <h3>{translation.property?.title ?? translation.propertyId}</h3>
                <p className="form-help">{translation.title}</p>
              </div>
              <span className="form-help">{t("awaitingApproval")}</span>
            </article>
          ))}
        </div>
      ) : <p className="form-help">{t("emptyTranslations")}</p>}
    </div>
  );
}
