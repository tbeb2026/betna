import { getTranslations } from "next-intl/server";

export default async function SignInPage() {
  const t = await getTranslations("auth");
  return (
    <section className="auth-page" aria-labelledby="sign-in-title">
      <div className="auth-card">
        <p className="eyebrow">Betna</p>
        <h1 id="sign-in-title">{t("title")}</h1>
        <p className="lede">{t("description")}</p>
        <form className="auth-form">
          <label htmlFor="email">{t("emailLabel")}</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="password">{t("passwordLabel")}</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <button className="button primary" type="submit">{t("submit")}</button>
        </form>
      </div>
    </section>
  );
}
