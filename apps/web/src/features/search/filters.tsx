"use client";

import { ModeSwitch } from "./mode-switch";
import { useTranslations } from "next-intl";

export type SearchFilterValues = { country?: string; city?: string; category?: string; minPrice?: string; maxPrice?: string; mode?: string };

export function Filters({ locale, values }: { locale: string; values: SearchFilterValues }) {
  const t = useTranslations("search.filters");
  return (
    <form className="search-filters" action={`/${locale}/search`} method="get" aria-label={t("ariaLabel")}>
      <label>{t("country")}<select name="country" defaultValue={values.country ?? ""}><option value="">{t("everyCountry")}</option><option value="KE">{t("kenya")}</option><option value="UG">{t("uganda")}</option></select></label>
      <label>{t("city")}<input name="city" defaultValue={values.city ?? ""} placeholder={t("cityPlaceholder")} /></label>
      <label>{t("category")}<select name="category" defaultValue={values.category ?? ""}><option value="">{t("everyCategory")}</option><option value="residential">{t("residential")}</option><option value="land">{t("land")}</option><option value="commercial">{t("commercial")}</option></select></label>
      <label>{t("minimumPrice")}<input name="minPrice" inputMode="decimal" type="number" min="0" defaultValue={values.minPrice ?? ""} /></label>
      <label>{t("maximumPrice")}<input name="maxPrice" inputMode="decimal" type="number" min="0" defaultValue={values.maxPrice ?? ""} /></label>
      <ModeSwitch value={values.mode} />
      <button className="button primary" type="submit">{t("apply")}</button>
    </form>
  );
}
