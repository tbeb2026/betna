import type { CountryCode, CurrencyCode, RentalMode } from "@betna/contracts";

export type ManagedCityOption = {
  id: string;
  name: string;
  slug: string;
  countryCode: CountryCode;
};

export type PropertyFormPayload = {
  title: string;
  description: string;
  countryCode: CountryCode;
  cityId: string;
  category: string;
  subcategory: string;
  publicLocation: { label: string; latitude: number; longitude: number };
  exactLocation: { address: string; latitude: number; longitude: number };
  authorizationAttested: boolean;
  offerings: Array<{
    mode: RentalMode;
    currency: CurrencyCode;
    basePrice: number;
    minimumNights?: number;
    leaseDurationMonths?: number;
  }>;
};

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function number(form: FormData, name: string): number {
  const value = Number(text(form, name));
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

export function propertyInputFromFormData(
  form: FormData,
  cities: ManagedCityOption[],
): PropertyFormPayload {
  const countryCode = text(form, "countryCode") as CountryCode;
  if (countryCode !== "KE" && countryCode !== "UG") {
    throw new Error("A managed country is required");
  }
  const cityId = text(form, "cityId");
  const city = cities.find(
    (candidate) =>
      candidate.id === cityId && candidate.countryCode === countryCode,
  );
  if (!city)
    throw new Error("A managed city is required for the selected country");

  const currency: CurrencyCode = countryCode === "KE" ? "KES" : "UGX";
  const offerings: PropertyFormPayload["offerings"] = [];
  const shortStayPrice = text(form, "shortStayPrice");
  if (shortStayPrice) {
    offerings.push({
      mode: "SHORT_STAY",
      currency,
      basePrice: number(form, "shortStayPrice"),
      minimumNights: number(form, "shortStayMinimumNights"),
    });
  }
  const longTermPrice = text(form, "longTermPrice");
  if (longTermPrice) {
    offerings.push({
      mode: "LONG_TERM",
      currency,
      basePrice: number(form, "longTermPrice"),
      leaseDurationMonths: number(form, "longTermLeaseDuration"),
    });
  }

  return {
    title: text(form, "title"),
    description: text(form, "description"),
    countryCode,
    cityId: city.id,
    category: text(form, "category"),
    subcategory: text(form, "subcategory"),
    publicLocation: {
      label: text(form, "publicLocationLabel"),
      latitude: number(form, "publicLatitude"),
      longitude: number(form, "publicLongitude"),
    },
    exactLocation: {
      address: text(form, "exactAddress"),
      latitude: number(form, "exactLatitude"),
      longitude: number(form, "exactLongitude"),
    },
    authorizationAttested: text(form, "authorizationAttested") === "on",
    offerings,
  };
}
