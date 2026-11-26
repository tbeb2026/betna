import { getTranslations } from "next-intl/server";
import { AuthForm } from "./auth-form";
import { Link } from "../../../i18n/navigation";

export default async function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("auth");
  return (
    <section className="auth-page" aria-labelledby="sign-in-title">
      <div className="auth-card">
        <p className="eyebrow">Betna</p>
        <h1 id="sign-in-title">{t("title")}</h1>
        <p className="lede">{t("description")}</p>
        <AuthForm locale={locale} labels={{ emailLabel: t("emailLabel"), passwordLabel: t("passwordLabel"), submit: t("submit"), working: t("working"), otpTitle: t("otpTitle"), phoneLabel: t("phoneLabel"), otpCodeLabel: t("otpCodeLabel"), requestOtp: t("requestOtp"), verifyOtp: t("verifyOtp") }} />
        <p className="form-help"><Link href="/sign-in/onboarding">{t("onboardingTitle")}</Link></p>
      </div>
    </section>
  );
}
