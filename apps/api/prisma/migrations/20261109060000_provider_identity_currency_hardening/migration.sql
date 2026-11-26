-- Keep launch money values bounded even when writes bypass the Nest API.
ALTER TABLE "Country"
  ADD CONSTRAINT "Country_code_currency_check"
  CHECK (("code" = 'KE' AND "currency" = 'KES') OR ("code" = 'UG' AND "currency" = 'UGX'));

ALTER TABLE "Offering"
  ADD CONSTRAINT "Offering_currency_check"
  CHECK ("currency" IN ('KES', 'UGX'));

-- Owner identity flags are persisted defaults; this index supports the
-- sign-in lookup and operational review of accounts awaiting verification.
CREATE INDEX IF NOT EXISTS "User_status_emailVerified_phoneVerified_idx"
  ON "User" ("status", "emailVerified", "phoneVerified");
