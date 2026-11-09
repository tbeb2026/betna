import { Link } from "../../../i18n/navigation";
import { getTranslations } from "next-intl/server";

export default async function OwnerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.ownerHome" });
  return (
    <div className="portal-card">
      <h2>{t("title")}</h2>
      <p>{t("description")}</p>
      <div className="actions"><Link className="button primary" href="/owner/properties">{t("manage")}</Link></div>
    </div>
  );
}
