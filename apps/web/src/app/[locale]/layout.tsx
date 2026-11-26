import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "../../i18n/navigation";
import { routing, getDocumentDirection } from "../../i18n/routing";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const messages = await getMessages();
  const t = await getTranslations("nav");
  return (
    <html lang={locale} dir={getDocumentDirection(locale)}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <header className="site-header">
            <Link className="brand" href="/" aria-label="Betna home">Betna</Link>
            <nav aria-label="Primary navigation">
              <Link href="/">{t("home")}</Link>
              <Link href="/owner">{t("owner")}</Link>
              <Link href="/verifier">{t("verifier")}</Link>
              <Link href="/admin">{t("admin")}</Link>
            </nav>
            <Link className="sign-in" href="/sign-in">{t("signIn")}</Link>
          </header>
          <main>{children}</main>
          <footer className="site-footer"><span>Betna</span><span>Kenya · Uganda</span></footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
