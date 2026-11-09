import { getTranslations } from "next-intl/server";

export default async function VerifierPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.verifier" });
  return <div className="portal-card"><h2>{t("assignedInspections")}</h2><p>{t("homeDescription")}</p></div>;
}
