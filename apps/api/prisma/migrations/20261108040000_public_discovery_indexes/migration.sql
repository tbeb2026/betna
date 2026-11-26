-- Public discovery filters first narrow by publication/verification state and geography.
CREATE INDEX "Property_status_verificationValidUntil_countryId_cityId_category_idx"
  ON "Property"("status", "verificationValidUntil", "countryId", "cityId", "category");

CREATE INDEX "Offering_mode_basePrice_idx"
  ON "Offering"("mode", "basePrice");
