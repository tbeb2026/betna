import { getTranslations } from "next-intl/server";
import { Link } from "../../i18n/navigation";

export default async function HomePage() {
  const t = await getTranslations("home");
  return (
    <section className="hero" aria-labelledby="home-title">
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1 id="home-title">{t("title")}</h1>
      <p className="lede">{t("description")}</p>
      <div className="actions">
        <Link className="button primary" href="/owner">{t("ownerCta")}</Link>
        <Link className="button secondary" href="/places">{t("searchCta")}</Link>
      </div>
    </section>
  );
}
