-- Persist the staff actor that approved an immutable public snapshot.
ALTER TABLE "PropertyVersion"
ADD COLUMN "approvedBy" UUID;
