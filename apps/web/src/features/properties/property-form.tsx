"use client";

import { useActionState, useState } from "react";
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
  return Number((value + 0.0001).toFixed(6));
}

export function PropertyForm({
  propertyId,
  options,
  initialProperty,
}: PropertyFormProps) {
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
        <legend>Place details</legend>
        <label htmlFor="property-title">Property title</label>
        <input
          id="property-title"
          name="title"
          type="text"
          placeholder="A clear name for your place"
          defaultValue={value(initialProperty?.title)}
          required
        />
        <label htmlFor="property-description">Description</label>
        <textarea
          id="property-description"
          name="description"
          rows={4}
          defaultValue={value(initialProperty?.description)}
          required
        />
        <label htmlFor="property-country">Country</label>
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
          <option value="KE">Kenya (KES)</option>
          <option value="UG">Uganda (UGX)</option>
        </select>
        <label htmlFor="property-city">City</label>
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
        <label htmlFor="property-category">Category</label>
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
              {entry.label}
            </option>
          ))}
        </select>
        <label htmlFor="property-subcategory">Subcategory</label>
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
              {subcategory.label}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset className="form-section">
        <legend>Location</legend>
        <p className="form-help">
          Visitors see only an approximate area. The exact address stays private
          for Betna verification.
        </p>
        <label htmlFor="public-location">Public area or neighborhood</label>
        <input
          id="public-location"
          name="publicLocationLabel"
          type="text"
          defaultValue={value(initialProperty?.publicLocationLabel)}
          required
        />
        <div className="coordinate-grid">
          <label htmlFor="public-latitude">Approximate latitude</label>
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
          <label htmlFor="public-longitude">Approximate longitude</label>
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
        <label htmlFor="exact-address">Exact address (private)</label>
        <input
          id="exact-address"
          name="exactAddress"
          type="text"
          defaultValue={value(initialProperty?.exactAddress)}
          required
        />
        <div className="coordinate-grid">
          <label htmlFor="exact-latitude">Exact latitude (private)</label>
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
          <label htmlFor="exact-longitude">Exact longitude (private)</label>
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
        <legend>Authorization</legend>
        <label className="check-label" htmlFor="authorization-attested">
          <input
            id="authorization-attested"
            name="authorizationAttested"
            type="checkbox"
            defaultChecked={Boolean(initialProperty?.authorizationAttested)}
            required
          />
          I confirm that I own or am authorized to list this place
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
          Save draft
        </button>
        <button
          className="button primary"
          type="submit"
          name="formAction"
          value="submit"
          disabled={pending}
        >
          Submit for review
        </button>
      </div>
    </form>
  );
}
