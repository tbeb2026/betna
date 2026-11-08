import type { Metadata } from "next";
import type { PublicProperty } from "./property-card";

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";

export function normalizeLocale(locale: string | undefined) {
  return locale?.toLowerCase().startsWith("ti") ? "ti" : "en";
}

export function canonicalLocale(locale: string, properties: Array<Pick<PublicProperty, "availableLocales">>) {
  const requested = normalizeLocale(locale);
  if (requested === "en") return "en";
  return properties.some((property) =>
    (property.availableLocales ?? ["en"]).some((available) => normalizeLocale(available) === requested),
  ) ? requested : "en";
}

export function localizedAlternates(pathname: string, properties: Array<Pick<PublicProperty, "availableLocales">>) {
  const locales = new Set<string>(["en"]);
  for (const property of properties) {
    for (const locale of property.availableLocales ?? []) locales.add(normalizeLocale(locale));
  }
  return Object.fromEntries([...locales].map((locale) => [locale, `${siteUrl}/${locale}${pathname}`]));
}

export function collectionMetadata(locale: string, pathname: string, properties: Array<Pick<PublicProperty, "availableLocales">>, title: string, description: string): Metadata {
  const canonical = canonicalLocale(locale, properties);
  return {
    title: `${title} | Betna`,
    description,
    alternates: { canonical: `${siteUrl}/${canonical}${pathname}`, languages: localizedAlternates(pathname, properties) },
    openGraph: { title, description, url: `${siteUrl}/${canonical}${pathname}`, type: "website" },
  };
}

export function jsonLd(value: Record<string, unknown>) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(value) }} />;
}

export function collectionJsonLd(
  url: string,
  name: string,
  properties: Array<Pick<PublicProperty, "slug" | "title" | "description" | "locale" | "availableLocales">>,
) {
  const requestedLocale = url.match(/\/(en|ti)(?=\/|$)/i)?.[1] ?? "en";
  const resolvedLocale = canonicalLocale(requestedLocale, properties);
  const canonicalUrl = url.replace(/\/(en|ti)(?=\/|$)/i, `/${resolvedLocale}`);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    url: canonicalUrl,
    name,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: properties.map((property, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${siteUrl}/${property.locale ?? resolvedLocale}/property/${encodeURIComponent(property.slug)}`,
        name: property.title,
        description: property.description,
      })),
    },
  };
}
