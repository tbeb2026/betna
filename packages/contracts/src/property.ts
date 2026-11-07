import type { CountryCode, CurrencyCode, ListingStatus, RentalMode } from './enums';

export interface PublicLocation {
  country: CountryCode;
  city: string;
  neighborhood?: string;
  label: string;
  /** Deliberately approximate map coordinates; never an exact address. */
  latitude: number;
  longitude: number;
}

export interface PrivateLocation {
  exactAddress: string;
  latitude: number;
  longitude: number;
}

export interface PropertyOffering {
  mode: RentalMode;
  currency: CurrencyCode;
  basePrice: number;
  negotiable: boolean;
  minimumNights?: number;
  moveInDate?: string;
  leaseDurationMonths?: number;
}

export interface PropertySummary {
  id: string;
  slug: string;
  title: string;
  category: string;
  subcategory?: string;
  status: ListingStatus;
  location: PublicLocation;
  offerings: PropertyOffering[];
  verificationValidUntil?: string;
}

export interface PropertyDetail extends PropertySummary {
  description: string;
  amenities: string[];
  lastInspectedAt?: string;
}
