"use client";

import { useTranslations } from "next-intl";

export function ModeSwitch({ value }: { value?: string }) {
  const t = useTranslations("search.mode");
  return (
    <fieldset className="mode-switch">
      <legend>{t("legend")}</legend>
      <label><input type="radio" name="mode" value="" defaultChecked={!value} /> {t("all")}</label>
      <label><input type="radio" name="mode" value="SHORT_STAY" defaultChecked={value === "SHORT_STAY"} /> {t("shortStay")}</label>
      <label><input type="radio" name="mode" value="LONG_TERM" defaultChecked={value === "LONG_TERM"} /> {t("longTerm")}</label>
    </fieldset>
  );
}
