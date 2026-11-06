import { getTranslations } from "next-intl/server";
import { requireRole } from "../../../lib/auth";

export default async function VerifierLayout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  await requireRole("VERIFIER", locale);
  const t = await getTranslations("portal");
  return <section className="portal" aria-labelledby="portal-title"><p className="eyebrow">Betna</p><h1 id="portal-title">{t("verifierTitle")}</h1><p className="lede">{t("verifierDescription")}</p>{children}</section>;
}
