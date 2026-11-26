-- Owner submission idempotency and verifier report retries are separate
-- concerns. Preserve owner-submit:* keys from the previous column while
-- dropping report keys that were incorrectly stored there by the old model.
DROP INDEX IF EXISTS "Inspection_submissionRequestKey_key";

ALTER TABLE "Inspection"
RENAME COLUMN "submissionRequestKey" TO "ownerSubmissionKey";

ALTER TABLE "Inspection"
ADD COLUMN "reportRequestKey" VARCHAR(128);

UPDATE "Inspection"
SET "reportRequestKey" = "ownerSubmissionKey"
WHERE "ownerSubmissionKey" IS NOT NULL
  AND "ownerSubmissionKey" NOT LIKE 'owner-submit:%';

UPDATE "Inspection"
SET "ownerSubmissionKey" = NULL
WHERE "ownerSubmissionKey" IS NOT NULL
  AND "ownerSubmissionKey" NOT LIKE 'owner-submit:%';

CREATE UNIQUE INDEX "Inspection_ownerSubmissionKey_key"
ON "Inspection"("ownerSubmissionKey");
