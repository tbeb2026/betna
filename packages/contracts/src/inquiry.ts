import type { InquiryStatus, RentalMode } from './enums';

export interface GuestInquiryInput {
  propertyId: string;
  offeringId?: string;
  mode: RentalMode;
  name: string;
  email: string;
  phone: string;
  message: string;
  startDate?: string;
  endDate?: string;
  guests?: number;
  /** Requested UI/notification locale. Unsupported values normalize to English. */
  locale?: string;
}

export interface InquirySummary {
  id: string;
  reference: string;
  status: InquiryStatus;
  createdAt: string;
}
