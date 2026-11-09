-- Final review hardening. Deployments should run `prisma migrate deploy`.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "authorizationAttested" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Inquiry"
  ADD COLUMN IF NOT EXISTS "ownerResponseMessage" TEXT;

CREATE TABLE IF NOT EXISTS "ChecklistDefinition" (
  "id" UUID PRIMARY KEY,
  "category" VARCHAR(80) NOT NULL,
  "version" INTEGER NOT NULL,
  "definition" JSONB NOT NULL,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChecklistDefinition_category_version_key" UNIQUE ("category", "version")
);
CREATE INDEX IF NOT EXISTS "ChecklistDefinition_category_isPublished_version_idx"
  ON "ChecklistDefinition" ("category", "isPublished", "version");

CREATE TABLE IF NOT EXISTS "UnavailableDate" (
  "id" UUID PRIMARY KEY,
  "propertyId" UUID NOT NULL REFERENCES "Property"("id") ON DELETE CASCADE,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "reason" VARCHAR(240),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "UnavailableDate_propertyId_startDate_endDate_idx"
  ON "UnavailableDate" ("propertyId", "startDate", "endDate");
