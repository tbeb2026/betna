"use server";

import { cookies } from "next/headers";
import { createApiClient, type ApiClient } from "../../lib/api-client";
import {
  propertyInputFromFormData,
  type ManagedCityOption,
} from "./property-form-data";

export type TaxonomyOption = {
  category: string;
  label: string;
  subcategories: Array<{ value: string; label: string }>;
};

export type OwnerPropertyOptions = {
  taxonomy: TaxonomyOption[];
  cities: ManagedCityOption[];
};

export type OwnerPropertyActionState = {
  status: "idle" | "success" | "error";
  message: string;
  propertyId?: string;
};

const FALLBACK_OPTIONS: OwnerPropertyOptions = {
  taxonomy: [
    {
      category: "residential",
      label: "Residential",
      subcategories: [
        { value: "apartment", label: "Apartment" },
        { value: "house", label: "House" },
        { value: "room", label: "Room" },
        { value: "furnished_stay", label: "Furnished stay" },
        { value: "guesthouse", label: "Guesthouse" },
        { value: "vacation_home", label: "Vacation home" },
      ],
    },
    {
      category: "land",
      label: "Land",
      subcategories: [{ value: "land", label: "Land" }],
    },
    {
      category: "commercial",
      label: "Commercial",
      subcategories: [
        { value: "office", label: "Office" },
        { value: "shop", label: "Shop" },
        { value: "warehouse", label: "Warehouse" },
        { value: "commercial_space", label: "Commercial space" },
        { value: "other", label: "Other" },
      ],
    },
  ],
  cities: [
    {
      id: "city-ke-nairobi",
      name: "Nairobi",
      slug: "nairobi",
      countryCode: "KE",
    },
    {
      id: "city-ug-kampala",
      name: "Kampala",
      slug: "kampala",
      countryCode: "UG",
    },
  ],
};

async function ownerApi(): Promise<{
  client: ApiClient;
  token: string;
} | null> {
  const token = (await cookies()).get("betna_session")?.value;
  if (!token) return null;
  return {
    client: createApiClient({
      token,
      baseUrl: process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL,
    }),
    token,
  };
}

export async function getOwnerPropertyOptions(): Promise<OwnerPropertyOptions> {
  const auth = await ownerApi();
  if (!auth) return FALLBACK_OPTIONS;
  try {
    const [taxonomy, geography] = await Promise.all([
      auth.client.get<TaxonomyOption[]>("/owner/properties/taxonomy"),
      auth.client.get<
        Array<{
          code: "KE" | "UG";
          cities: Array<{ id: string; name: string; slug: string }>;
        }>
      >("/owner/properties/geography"),
    ]);
    return {
      taxonomy,
      cities: geography.flatMap((country) =>
        country.cities.map((city) => ({ ...city, countryCode: country.code })),
      ),
    };
  } catch {
    return FALLBACK_OPTIONS;
  }
}

export async function getOwnerProperties<T = unknown>(): Promise<T[]> {
  const auth = await ownerApi();
  if (!auth) return [];
  try {
    return await auth.client.get<T[]>("/owner/properties");
  } catch {
    return [];
  }
}

export async function getOwnerProperty<T = unknown>(
  propertyId: string,
): Promise<T | null> {
  const auth = await ownerApi();
  if (!auth) return null;
  try {
    return await auth.client.get<T>(
      `/owner/properties/${encodeURIComponent(propertyId)}`,
    );
  } catch {
    return null;
  }
}

export async function saveOwnerProperty(
  _previous: OwnerPropertyActionState,
  form: FormData,
): Promise<OwnerPropertyActionState> {
  const auth = await ownerApi();
  if (!auth)
    return { status: "error", message: "Your owner session has expired." };

  try {
    const options = await getOwnerPropertyOptions();
    const payload = propertyInputFromFormData(form, options.cities);
    const propertyId = String(form.get("propertyId") ?? "").trim();
    const saved = propertyId
      ? await auth.client.patch<{ id: string }>(
          `/owner/properties/${encodeURIComponent(propertyId)}`,
          payload,
        )
      : await auth.client.post<{ id: string }>("/owner/properties", payload);
    if (form.get("formAction") === "submit") {
      await auth.client.post(
        `/owner/properties/${encodeURIComponent(saved.id)}/submit`,
        {},
      );
    }
    return {
      status: "success",
      propertyId: saved.id,
      message:
        form.get("formAction") === "submit"
          ? "Your place is ready for Betna review."
          : "Draft saved.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to save this draft.",
    };
  }
}
