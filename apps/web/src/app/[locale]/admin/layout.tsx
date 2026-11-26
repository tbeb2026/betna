import { getTranslations } from "next-intl/server";
import { requireRole } from "../../../lib/auth";

export default async function AdminLayout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  await requireRole("ADMIN", locale);
  const t = await getTranslations("portal");
  return <section className="portal" aria-labelledby="portal-title"><p className="eyebrow">Betna</p><h1 id="portal-title">{t("adminTitle")}</h1><p className="lede">{t("adminDescription")}</p>{children}</section>;
}
