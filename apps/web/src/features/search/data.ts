import { createApiClient } from "../../lib/api-client";
import type { PublicProperty } from "./property-card";

export type PublicSearchParams = Record<string, string | undefined>;

function queryString(params: PublicSearchParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return query.toString();
}

export async function getPublicProperties(params: PublicSearchParams = {}) {
  try {
    const query = queryString(params);
    return await createApiClient().get<PublicProperty[]>(`/public/properties${query ? `?${query}` : ""}`);
  } catch { return []; }
}

export async function getPublicProperty(slug: string, locale: string) {
  try { return await createApiClient().get<PublicProperty>(`/public/properties/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`); }
  catch { return null; }
}
