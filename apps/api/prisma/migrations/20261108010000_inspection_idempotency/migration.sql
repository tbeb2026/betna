ALTER TABLE "Inspection"
ADD COLUMN "checklistVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "submissionRequestKey" VARCHAR(128);

CREATE UNIQUE INDEX "Inspection_submissionRequestKey_key"
ON "Inspection"("submissionRequestKey");
