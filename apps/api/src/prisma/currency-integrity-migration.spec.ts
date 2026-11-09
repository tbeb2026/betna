import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  process.cwd().endsWith("/apps/api")
    ? "prisma/migrations/20261109070000_property_currency_integrity/migration.sql"
    : "apps/api/prisma/migrations/20261109070000_property_currency_integrity/migration.sql",
);

describe("property currency integrity migration", () => {
  it("installs an idempotent database trigger for every monetary record path", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION enforce_property_currency_consistency()");
    expect(sql).toContain('DROP TRIGGER IF EXISTS "Offering_property_currency_consistency" ON "Offering"');
    expect(sql).toContain('DROP TRIGGER IF EXISTS "Conversion_property_currency_consistency" ON "Conversion"');
    expect(sql).toContain('DROP TRIGGER IF EXISTS "Commission_property_currency_consistency" ON "Commission"');
    expect(sql).toContain('DROP TRIGGER IF EXISTS "Property_currency_consistency" ON "Property"');
    expect(sql).toContain('DROP TRIGGER IF EXISTS "Country_currency_consistency" ON "Country"');
    expect(sql).toContain("RAISE EXCEPTION USING");
    expect(sql).toContain("ERRCODE = '23514'");
    expect(sql).toContain("Offering_property_currency_check");
    expect(sql).toContain("Conversion_property_currency_check");
    expect(sql).toContain("Commission_property_currency_check");
    expect(sql).toContain("Property_currency_consistency_check");
    expect(sql).toContain("Country_currency_consistency_check");
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF "propertyId", "currency" ON "Offering"');
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF "propertyId", "firstPaymentCurrency" ON "Conversion"');
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF "conversionId", "currency" ON "Commission"');
    expect(sql).toContain('BEFORE UPDATE OF "countryId" ON "Property"');
    expect(sql).toContain('BEFORE UPDATE OF "code", "currency" ON "Country"');
  });
});
