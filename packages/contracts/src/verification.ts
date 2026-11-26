import type { VerificationStatus } from './enums';

export interface InspectionEvidence {
  mediaId: string;
  syncedAt?: string;
  validatedAt?: string;
}

export interface InspectionSummary {
  id: string;
  propertyId: string;
  status: VerificationStatus;
  inspectedAt?: string;
  evidence: InspectionEvidence[];
}
