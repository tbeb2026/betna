import { getTranslations } from "next-intl/server";
import { OnboardingForm } from "../onboarding-form";

export default async function OwnerOnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("auth");
  return (
    <section className="auth-page" aria-labelledby="owner-onboarding-title">
      <div className="auth-card">
        <p className="eyebrow">Betna</p>
        <h1 id="owner-onboarding-title">{t("onboardingTitle")}</h1>
        <p className="lede">{t("onboardingDescription")}</p>
        <OnboardingForm locale={locale} labels={{
          firstNameLabel: t("firstNameLabel"),
          lastNameLabel: t("lastNameLabel"),
          emailLabel: t("emailLabel"),
          phoneLabel: t("phoneLabelOnboarding"),
          requestWhatsAppCode: t("requestWhatsAppCode"),
          whatsappCodeLabel: t("whatsappCodeLabel"),
          requestEmailVerification: t("requestEmailVerification"),
          emailVerificationCodeLabel: t("emailVerificationCodeLabel"),
          passwordLabel: t("passwordLabel"),
          authorizationAttestation: t("authorizationAttestation"),
          createOwnerAccount: t("createOwnerAccount"),
          creatingOwnerAccount: t("creatingOwnerAccount"),
        }} />
      </div>
    </section>
  );
}
