import { getTranslations } from "next-intl/server";

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.admin" });
  return <div className="portal-card"><h2>{t("reviewQueueTitle")}</h2><p>{t("reviewQueueDescription")}</p></div>;
}
