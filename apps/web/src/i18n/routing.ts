import { defineRouting } from "next-intl/routing";

export const supportedLocales = ["en", "ti"] as const;
export type Locale = (typeof supportedLocales)[number];
export const defaultLocale: Locale = "en";

export const routing = defineRouting({
  locales: supportedLocales,
  defaultLocale,
  localePrefix: "always",
});

export function isLocale(value: string | undefined): value is Locale {
  return Boolean(value && supportedLocales.includes(value as Locale));
}

export function resolveLocalePath(pathname: string): {
  locale: Locale;
  pathname: string;
} {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const [, first = "", ...rest] = normalized.split("/");
  if (isLocale(first)) {
    return { locale: first, pathname: rest.length ? `/${rest.join("/")}` : "/" };
  }
  return { locale: defaultLocale, pathname: normalized || "/" };
}

export function getDocumentDirection(_locale: Locale | string): "ltr" {
  return "ltr";
}

const roleRoute: Record<string, string> = {
  OWNER: "owner",
  VERIFIER: "verifier",
  ADMIN: "admin",
};

export function getRoleRedirectPath(
  actualRole: string,
  requestedRole: string,
  locale: Locale | string,
): string {
  const role = roleRoute[actualRole.toUpperCase()];
  if (role && role !== requestedRole.toLowerCase()) return `/${locale}/${role}`;
  return `/${locale}`;
}
