"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { OfferingForm } from "./offering-form";
import {
  saveOwnerProperty,
  type OwnerPropertyActionState,
  type OwnerPropertyOptions,
} from "./owner-properties";

type PropertyFormProps = {
  propertyId?: string;
  options: OwnerPropertyOptions;
  initialProperty?: any;
};

const initialState: OwnerPropertyActionState = { status: "idle", message: "" };

function value(input: unknown): string {
  return input === undefined || input === null ? "" : String(input);
}

function offsetCoordinate(value: number): number {
  return Number((value + 0.002).toFixed(6));
}

export function PropertyForm({
  propertyId,
  options,
  initialProperty,
}: PropertyFormProps) {
  const t = useTranslations("portal.propertyForm");
  const initialCountry = (initialProperty?.country?.code ??
    initialProperty?.countryCode ??
    "KE") as "KE" | "UG";
  const [country, setCountry] = useState<"KE" | "UG">(initialCountry);
  const [category, setCategory] = useState(
    initialProperty?.category ?? "residential",
  );
  const [subcategory, setSubcategory] = useState(
    initialProperty?.subcategory ?? "",
  );
  const [cityId, setCityId] = useState(initialProperty?.cityId ?? "");
  const [state, formAction, pending] = useActionState(
    saveOwnerProperty,
    initialState,
  );
  const currency = country === "KE" ? "KES" : "UGX";
  const cities = options.cities.filter((city) => city.countryCode === country);
  const selectedCityId = cities.some((city) => city.id === cityId)
    ? cityId
    : (cities[0]?.id ?? "");
  const selectedCategory = options.taxonomy.find(
    (entry) => entry.category === category,
  );
  const categoryLabels: Record<string, string> = {
    residential: t("categories.residential"),
    land: t("categories.land"),
    commercial: t("categories.commercial"),
  };
  const subcategoryLabels: Record<string, string> = {
    apartment: t("subcategories.apartment"),
    house: t("subcategories.house"),
    room: t("subcategories.room"),
    furnished_stay: t("subcategories.furnished_stay"),
    guesthouse: t("subcategories.guesthouse"),
    vacation_home: t("subcategories.vacation_home"),
    land: t("subcategories.land"),
    office: t("subcategories.office"),
    shop: t("subcategories.shop"),
    warehouse: t("subcategories.warehouse"),
    commercial_space: t("subcategories.commercial_space"),
    other: t("subcategories.other"),
  };
  const initialPublicLatitude = Number(
    initialProperty?.publicLatitude ?? -1.2921,
  );
  const initialPublicLongitude = Number(
    initialProperty?.publicLongitude ?? 36.7875,
  );

  return (
    <form className="property-form" action={formAction}>
      <input type="hidden" name="propertyId" value={propertyId ?? ""} />
      <fieldset className="form-section">
        <legend>{t("placeDetails")}</legend>
        <label htmlFor="property-title">{t("title")}</label>
        <input
          id="property-title"
          name="title"
          type="text"
          placeholder={t("titlePlaceholder")}
          defaultValue={value(initialProperty?.title)}
          required
        />
        <label htmlFor="property-description">{t("description")}</label>
        <textarea
          id="property-description"
          name="description"
          rows={4}
          defaultValue={value(initialProperty?.description)}
          required
        />
        <label htmlFor="property-country">{t("country")}</label>
        <select
          id="property-country"
          name="countryCode"
          value={country}
          onChange={(event) => {
            const nextCountry = event.target.value as "KE" | "UG";
            setCountry(nextCountry);
            setCityId(
              options.cities.find((city) => city.countryCode === nextCountry)
                ?.id ?? "",
            );
          }}
        >
          <option value="KE">{t("kenyaCurrency")}</option>
          <option value="UG">{t("ugandaCurrency")}</option>
        </select>
        <label htmlFor="property-city">{t("city")}</label>
        <select
          id="property-city"
          name="cityId"
          value={selectedCityId}
          onChange={(event) => setCityId(event.target.value)}
          required
        >
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>
        <label htmlFor="property-category">{t("category")}</label>
        <select
          id="property-category"
          name="category"
          value={category}
          onChange={(event) => {
            const nextCategory = event.target.value;
            setCategory(nextCategory);
            setSubcategory(
              options.taxonomy.find((entry) => entry.category === nextCategory)
                ?.subcategories[0]?.value ?? "",
            );
          }}
          required
        >
          {options.taxonomy.map((entry) => (
            <option key={entry.category} value={entry.category}>
              {categoryLabels[entry.category] ?? entry.label}
            </option>
          ))}
        </select>
        <label htmlFor="property-subcategory">{t("subcategory")}</label>
        <select
          id="property-subcategory"
          name="subcategory"
          value={
            selectedCategory?.subcategories.some(
              (entry) => entry.value === subcategory,
            )
              ? subcategory
              : (selectedCategory?.subcategories[0]?.value ?? "")
          }
          onChange={(event) => setSubcategory(event.target.value)}
          required
        >
          {selectedCategory?.subcategories.map((subcategory) => (
            <option key={subcategory.value} value={subcategory.value}>
              {subcategoryLabels[subcategory.value] ?? subcategory.label}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset className="form-section">
        <legend>{t("location")}</legend>
        <p className="form-help">
          {t("locationHelp")}
        </p>
        <label htmlFor="public-location">{t("publicLocation")}</label>
        <input
          id="public-location"
          name="publicLocationLabel"
          type="text"
          defaultValue={value(initialProperty?.publicLocationLabel)}
          required
        />
        <div className="coordinate-grid">
          <label htmlFor="public-latitude">{t("approximateLatitude")}</label>
          <input
            id="public-latitude"
            name="publicLatitude"
            type="number"
            step="any"
            min="-90"
            max="90"
            defaultValue={initialPublicLatitude}
            required
          />
          <label htmlFor="public-longitude">{t("approximateLongitude")}</label>
          <input
            id="public-longitude"
            name="publicLongitude"
            type="number"
            step="any"
            min="-180"
            max="180"
            defaultValue={initialPublicLongitude}
            required
          />
        </div>
        <label htmlFor="exact-address">{t("exactAddress")}</label>
        <input
          id="exact-address"
          name="exactAddress"
          type="text"
          defaultValue={value(initialProperty?.exactAddress)}
          required
        />
        <div className="coordinate-grid">
          <label htmlFor="exact-latitude">{t("exactLatitude")}</label>
          <input
            id="exact-latitude"
            name="exactLatitude"
            type="number"
            step="any"
            min="-90"
            max="90"
            defaultValue={Number(
              initialProperty?.exactLatitude ??
                offsetCoordinate(initialPublicLatitude),
            )}
            required
          />
          <label htmlFor="exact-longitude">{t("exactLongitude")}</label>
          <input
            id="exact-longitude"
            name="exactLongitude"
            type="number"
            step="any"
            min="-180"
            max="180"
            defaultValue={Number(
              initialProperty?.exactLongitude ??
                offsetCoordinate(initialPublicLongitude),
            )}
            required
          />
        </div>
      </fieldset>

      <OfferingForm currency={currency} initialProperty={initialProperty} />

      <fieldset className="form-section">
        <legend>{t("authorization")}</legend>
        <label className="check-label" htmlFor="authorization-attested">
          <input
            id="authorization-attested"
            name="authorizationAttested"
            type="checkbox"
            defaultChecked={Boolean(initialProperty?.authorizationAttested)}
            required
          />
          {t("authorizationText")}
        </label>
      </fieldset>

      {state.message ? (
        <p
          className={state.status === "error" ? "form-error" : "form-success"}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      <div className="actions">
        <button
          className="button secondary"
          type="submit"
          name="formAction"
          value="draft"
          disabled={pending}
        >
          {t("saveDraft")}
        </button>
        <button
          className="button primary"
          type="submit"
          name="formAction"
          value="submit"
          disabled={pending}
        >
          {t("submitReview")}
        </button>
      </div>
    </form>
  );
}
