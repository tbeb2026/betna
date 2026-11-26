import { getTranslations } from "next-intl/server";
import { Link } from "../../i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return <section className="empty-state"><h1>{t("notFound")}</h1><Link href="/">{t("backHome")}</Link></section>;
}
