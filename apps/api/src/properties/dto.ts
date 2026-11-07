import type { CountryCode, CurrencyCode, RentalMode } from "@betna/contracts";

export interface PropertyLocationInput {
  label: string;
  latitude: number;
  longitude: number;
}

export interface ExactLocationInput {
  address: string;
  latitude: number;
  longitude: number;
}

export interface OfferingInput {
  mode: RentalMode;
  currency: CurrencyCode;
  basePrice: number;
  negotiable?: boolean;
  minimumNights?: number;
  moveInDate?: string | Date;
  leaseDurationMonths?: number;
}

export interface CreatePropertyInput {
  title: string;
  description: string;
  countryCode: CountryCode;
  /** Optional for callers that already resolved a country from managed geography. */
  countryId?: string;
  cityId: string;
  neighborhoodId?: string;
  category: string;
  subcategory?: string;
  amenities?: string[];
  publicLocation: PropertyLocationInput;
  exactLocation: ExactLocationInput;
  authorizationAttested?: boolean;
  offerings: OfferingInput[];
}

export type UpdatePropertyInput = Partial<CreatePropertyInput>;
