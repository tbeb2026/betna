"use client";
import { useTranslations } from "next-intl";

type OfferingFormProps = {
  currency: "KES" | "UGX";
  initialProperty?: any;
};

export function OfferingForm({ currency, initialProperty }: OfferingFormProps) {
  const t = useTranslations("portal.propertyForm");
  const offerings = initialProperty?.offerings ?? [];
  const shortStay = offerings.find(
    (offering: any) => offering.mode === "SHORT_STAY",
  );
  const longTerm = offerings.find(
    (offering: any) => offering.mode === "LONG_TERM",
  );
  return (
    <fieldset className="form-section">
      <legend>{t("rentalOptions")}</legend>
      <p className="form-help">{t("rentalHelp")}</p>
      <div className="offering-grid">
        <div className="offering-card">
          <h3>{t("shortStay")}</h3>
          <label htmlFor="short-stay-price">
            {t("shortStayPrice", { currency })}
          </label>
          <input
            id="short-stay-price"
            name="shortStayPrice"
            type="number"
            min="1"
            defaultValue={shortStay?.basePrice ?? ""}
          />
          <label htmlFor="short-stay-minimum">{t("minimumNights")}</label>
          <input
            id="short-stay-minimum"
            name="shortStayMinimumNights"
            type="number"
            min="1"
            defaultValue={shortStay?.minimumNights ?? 1}
          />
        </div>
        <div className="offering-card">
          <h3>{t("longTerm")}</h3>
          <label htmlFor="long-term-price">
            {t("longTermPrice", { currency })}
          </label>
          <input
            id="long-term-price"
            name="longTermPrice"
            type="number"
            min="1"
            defaultValue={longTerm?.basePrice ?? ""}
          />
          <label htmlFor="long-term-duration">{t("leaseDuration")}</label>
          <input
            id="long-term-duration"
            name="longTermLeaseDuration"
            type="number"
            min="1"
            defaultValue={longTerm?.leaseDurationMonths ?? 12}
          />
        </div>
      </div>
    </fieldset>
  );
}
