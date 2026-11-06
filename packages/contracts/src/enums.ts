/** Countries supported by the first Betna release. */
export type CountryCode = 'KE' | 'UG';

export type CurrencyCode = 'KES' | 'UGX';

export type RentalMode = 'SHORT_STAY' | 'LONG_TERM';

export type ListingStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'PENDING_INSPECTION'
  | 'VERIFIED'
  | 'PUBLISHED'
  | 'PAUSED'
  | 'EXPIRED'
  | 'FRAUD_REVIEW'
  | 'REJECTED'
  | 'UNPUBLISHED';

export type InquiryStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'LOCATION_APPROVED'
  | 'OWNER_CONFIRMED'
  | 'OWNER_DECLINED'
  | 'CLOSED';

export type VerificationStatus =
  | 'DRAFT'
  | 'PENDING_UPLOAD'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

export type CommissionStatus = 'CONFIRMED' | 'COMMISSION_DUE' | 'PAID' | 'WAIVED' | 'DISPUTED';

export const COUNTRY_CURRENCY: Readonly<Record<CountryCode, CurrencyCode>> = {
  KE: 'KES',
  UG: 'UGX',
};

export const COUNTRY_NAMES: Readonly<Record<CountryCode, string>> = {
  KE: 'Kenya',
  UG: 'Uganda',
};
