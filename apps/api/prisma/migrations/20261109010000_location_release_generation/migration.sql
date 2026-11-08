ALTER TABLE "Inquiry" ADD COLUMN "locationReleaseId" UUID;

CREATE UNIQUE INDEX "Inquiry_locationReleaseId_key" ON "Inquiry"("locationReleaseId");

-- Old rows with an approved release but no expiry are not safe to expose.
-- Revoke them before enforcing the invariant for all future writes.
UPDATE "Inquiry"
SET "status" = 'CONTACTED',
    "locationApprovedAt" = NULL,
    "locationReleaseExpiresAt" = NULL,
    "locationRevokedAt" = COALESCE("locationRevokedAt", CURRENT_TIMESTAMP),
    "locationReleasedBy" = NULL,
    "locationReleaseId" = NULL
WHERE "status" = 'LOCATION_APPROVED'
  AND "locationReleaseExpiresAt" IS NULL;

ALTER TABLE "Inquiry"
ADD CONSTRAINT "Inquiry_location_approved_expiry_check"
CHECK ("status" <> 'LOCATION_APPROVED' OR "locationReleaseExpiresAt" IS NOT NULL);
