"use server";

import { cookies } from "next/headers";
import { createApiClient } from "../../lib/api-client";

export type VerificationInspection = {
  id: string;
  propertyId: string;
  territoryId?: string | null;
  status: string;
  notes?: string | null;
  property?: { id: string; title?: string; category?: string };
};

async function verificationApi() {
  const token = (await cookies()).get("betna_session")?.value;
  if (!token) return null;
  return createApiClient({
    token,
    baseUrl: process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL,
  });
}

export async function getVerifierInspections() {
  const api = await verificationApi();
  if (!api) return [];
  try {
    return await api.get<VerificationInspection[]>("/verification/inspections");
  } catch {
    return [];
  }
}

export async function getVerifierInspection(id: string) {
  const api = await verificationApi();
  if (!api) return null;
  try {
    return await api.get<VerificationInspection>(
      `/verification/inspections/${encodeURIComponent(id)}`,
    );
  } catch {
    return null;
  }
}

export async function getAdminReviewQueue() {
  const api = await verificationApi();
  if (!api) return [];
  try {
    return await api.get<VerificationInspection[]>(
      "/verification/inspections/review",
    );
  } catch {
    return [];
  }
}
