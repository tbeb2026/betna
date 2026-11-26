-- Publishing lifecycle additions: approved snapshots survive material edits,
-- and translations have an explicit approval boundary.
ALTER TABLE "Property" ADD COLUMN "fraudReason" TEXT;

CREATE TABLE "PropertyVersion" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropertyTranslation" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PropertyTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PropertyVersion_propertyId_version_key" ON "PropertyVersion"("propertyId", "version");
CREATE INDEX "PropertyVersion_propertyId_isApproved_idx" ON "PropertyVersion"("propertyId", "isApproved");
CREATE UNIQUE INDEX "PropertyTranslation_propertyId_locale_key" ON "PropertyTranslation"("propertyId", "locale");
CREATE INDEX "PropertyTranslation_locale_approved_idx" ON "PropertyTranslation"("locale", "approved");

ALTER TABLE "PropertyVersion" ADD CONSTRAINT "PropertyVersion_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyTranslation" ADD CONSTRAINT "PropertyTranslation_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
