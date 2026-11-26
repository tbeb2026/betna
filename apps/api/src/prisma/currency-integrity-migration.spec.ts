import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  process.cwd().endsWith("/apps/api")
    ? "prisma/migrations/20261109070000_property_currency_integrity/migration.sql"
    : "apps/api/prisma/migrations/20261109070000_property_currency_integrity/migration.sql",
);
const followOnMigrationPath = resolve(
  process.cwd(),
  process.cwd().endsWith("/apps/api")
    ? "prisma/migrations/20261109100000_property_currency_integrity_commission_serialization/migration.sql"
    : "apps/api/prisma/migrations/20261109100000_property_currency_integrity_commission_serialization/migration.sql",
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

  it("serializes conversion changes with linked commission writes", () => {
    const sql = readFileSync(followOnMigrationPath, "utf8");

    expect(sql).toContain("DO $preflight$");
    expect(sql).toContain("Cannot install property currency integrity: existing Conversion currency mismatch");
    expect(sql).toContain("Cannot install property currency integrity: existing Commission currency mismatch");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION enforce_property_currency_consistency()");
    expect(sql).toContain('SELECT v."id"\n      INTO locked_conversion_id\n      FROM "Conversion" v\n     WHERE v."id" = NEW."id"\n     FOR KEY SHARE');
    expect(sql).toContain('SELECT v."id"\n      INTO locked_conversion_id\n      FROM "Conversion" v\n     WHERE v."id" = NEW."conversionId"\n     FOR KEY SHARE');
    expect(sql).toContain('FOR KEY SHARE OF v, p, c');
    expect(sql).toContain('FROM "Commission" m');
    expect(sql).toContain('m."conversionId" = NEW."id"');
    expect(sql).toContain('m."currency" IS DISTINCT FROM expected_currency');
    expect(sql).toContain('Conversion %s linked Commission %s currency');

    const conversionBranch = sql.slice(sql.indexOf("IF TG_TABLE_NAME = 'Conversion'"));
    const conversionLock = conversionBranch.indexOf('SELECT v."id"\n      INTO locked_conversion_id');
    expect(conversionLock).toBeGreaterThanOrEqual(0);
    expect(conversionLock).toBeLessThan(conversionBranch.indexOf('SELECT c."currency"'));
    const commissionBranch = sql.slice(sql.indexOf("IF TG_TABLE_NAME = 'Commission'"));
    const commissionLock = commissionBranch.indexOf('SELECT v."id"\n      INTO locked_conversion_id');
    expect(commissionLock).toBeGreaterThanOrEqual(0);
    expect(commissionLock).toBeLessThan(commissionBranch.indexOf('SELECT c."currency"'));
  });

  it("preflights null conversion currency linked commission mismatches before replacing the trigger", () => {
    const sql = readFileSync(followOnMigrationPath, "utf8");

    const preflightEnd = sql.indexOf("CREATE OR REPLACE FUNCTION");
    expect(preflightEnd).toBeGreaterThan(0);
    const preflight = sql.slice(0, preflightEnd);
    expect(preflight).toContain('FROM "Commission" m');
    expect(preflight).toContain('JOIN "Conversion" v ON v."id" = m."conversionId"');
    expect(preflight).toContain('v."firstPaymentCurrency" IS NOT NULL');
    expect(preflight).toContain('m."currency" IS DISTINCT FROM c."currency"');
    expect(preflight).toContain("ERRCODE = '23514'");
  });
});
