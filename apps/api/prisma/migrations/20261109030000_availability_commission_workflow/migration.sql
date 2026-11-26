CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "AvailabilityBlock" (
  "id" UUID NOT NULL,
  "propertyId" UUID NOT NULL,
  "inquiryId" UUID NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AvailabilityBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AvailabilityBlock_inquiryId_key" UNIQUE ("inquiryId"),
  CONSTRAINT "AvailabilityBlock_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AvailabilityBlock_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AvailabilityBlock_valid_dates" CHECK ("endDate" > "startDate")
);

CREATE INDEX "AvailabilityBlock_propertyId_startDate_endDate_idx"
  ON "AvailabilityBlock"("propertyId", "startDate", "endDate");

ALTER TABLE "AvailabilityBlock"
  ADD CONSTRAINT "AvailabilityBlock_no_overlapping_dates"
  EXCLUDE USING gist (
    "propertyId" WITH =,
    tsrange("startDate", "endDate", '[)') WITH &&
  );

ALTER TABLE "Conversion" ADD COLUMN "verifiedBy" UUID;
