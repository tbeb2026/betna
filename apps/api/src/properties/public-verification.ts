export type PublicVerificationState = {
  status?: string | null;
  verificationValidUntil?: Date | string | null;
};

/**
 * The single eligibility rule for all public listing capabilities.
 * Missing, malformed, or expired validity is never treated as current.
 */
export function isCurrentPublicVerification(
  property: PublicVerificationState,
  now: Date = new Date(),
): boolean {
  if (property.status !== "PUBLISHED" || property.verificationValidUntil == null) {
    return false;
  }
  const validUntil = new Date(property.verificationValidUntil);
  return Number.isFinite(validUntil.getTime()) && validUntil.getTime() > now.getTime();
}
