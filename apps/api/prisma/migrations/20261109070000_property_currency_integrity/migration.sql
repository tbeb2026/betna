-- Keep every property-linked monetary value in the currency of its country,
-- including writes that bypass Prisma and the application services.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Offering" o
    JOIN "Property" p ON p."id" = o."propertyId"
    JOIN "Country" c ON c."id" = p."countryId"
    WHERE o."currency" IS DISTINCT FROM c."currency"
  ) THEN
    RAISE EXCEPTION 'Cannot install property currency integrity: existing Offering currency mismatch'
      USING ERRCODE = '23514', CONSTRAINT = 'Offering_property_currency_check';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Conversion" v
    JOIN "Property" p ON p."id" = v."propertyId"
    JOIN "Country" c ON c."id" = p."countryId"
    WHERE v."firstPaymentCurrency" IS NOT NULL
      AND v."firstPaymentCurrency" IS DISTINCT FROM c."currency"
  ) THEN
    RAISE EXCEPTION 'Cannot install property currency integrity: existing Conversion currency mismatch'
      USING ERRCODE = '23514', CONSTRAINT = 'Conversion_property_currency_check';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Commission" m
    JOIN "Conversion" v ON v."id" = m."conversionId"
    JOIN "Property" p ON p."id" = v."propertyId"
    JOIN "Country" c ON c."id" = p."countryId"
    WHERE m."currency" IS DISTINCT FROM c."currency"
  ) THEN
    RAISE EXCEPTION 'Cannot install property currency integrity: existing Commission currency mismatch'
      USING ERRCODE = '23514', CONSTRAINT = 'Commission_property_currency_check';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION enforce_property_currency_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  expected_currency varchar(3);
  actual_currency varchar(3);
  offending_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'Offering' THEN
    SELECT c."currency"
      INTO expected_currency
      FROM "Property" p
      JOIN "Country" c ON c."id" = p."countryId"
     WHERE p."id" = NEW."propertyId"
     FOR KEY SHARE OF p, c;

    actual_currency := NEW."currency";
    IF expected_currency IS NULL OR actual_currency IS DISTINCT FROM expected_currency THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Offering %s currency %s does not match property country currency %s', NEW."id", coalesce(actual_currency, '<null>'), coalesce(expected_currency, '<unavailable>')),
        ERRCODE = '23514',
        CONSTRAINT = 'Offering_property_currency_check';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'Conversion' THEN
    SELECT c."currency"
      INTO expected_currency
      FROM "Property" p
      JOIN "Country" c ON c."id" = p."countryId"
     WHERE p."id" = NEW."propertyId"
     FOR KEY SHARE OF p, c;

    actual_currency := NEW."firstPaymentCurrency";
    IF actual_currency IS NOT NULL AND (expected_currency IS NULL OR actual_currency IS DISTINCT FROM expected_currency) THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Conversion %s currency %s does not match property country currency %s', NEW."id", actual_currency, coalesce(expected_currency, '<unavailable>')),
        ERRCODE = '23514',
        CONSTRAINT = 'Conversion_property_currency_check';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'Commission' THEN
    SELECT c."currency"
      INTO expected_currency
      FROM "Conversion" v
      JOIN "Property" p ON p."id" = v."propertyId"
      JOIN "Country" c ON c."id" = p."countryId"
     WHERE v."id" = NEW."conversionId"
     FOR KEY SHARE OF p, c;

    actual_currency := NEW."currency";
    IF expected_currency IS NULL OR actual_currency IS DISTINCT FROM expected_currency THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Commission %s currency %s does not match property country currency %s', NEW."id", coalesce(actual_currency, '<null>'), coalesce(expected_currency, '<unavailable>')),
        ERRCODE = '23514',
        CONSTRAINT = 'Commission_property_currency_check';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'Property' THEN
    SELECT c."currency"
      INTO expected_currency
      FROM "Country" c
     WHERE c."id" = NEW."countryId";

    SELECT o."id"
      INTO offending_id
      FROM "Offering" o
     WHERE o."propertyId" = NEW."id"
       AND o."currency" IS DISTINCT FROM expected_currency
     LIMIT 1;
    IF offending_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Property %s country change would mismatch Offering %s currency', NEW."id", offending_id),
        ERRCODE = '23514',
        CONSTRAINT = 'Property_currency_consistency_check';
    END IF;

    SELECT v."id"
      INTO offending_id
      FROM "Conversion" v
     WHERE v."propertyId" = NEW."id"
       AND v."firstPaymentCurrency" IS NOT NULL
       AND v."firstPaymentCurrency" IS DISTINCT FROM expected_currency
     LIMIT 1;
    IF offending_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Property %s country change would mismatch Conversion %s currency', NEW."id", offending_id),
        ERRCODE = '23514',
        CONSTRAINT = 'Property_currency_consistency_check';
    END IF;

    SELECT m."id"
      INTO offending_id
      FROM "Commission" m
      JOIN "Conversion" v ON v."id" = m."conversionId"
     WHERE v."propertyId" = NEW."id"
       AND m."currency" IS DISTINCT FROM expected_currency
     LIMIT 1;
    IF offending_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Property %s country change would mismatch Commission %s currency', NEW."id", offending_id),
        ERRCODE = '23514',
        CONSTRAINT = 'Property_currency_consistency_check';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'Country' THEN
    SELECT o."id"
      INTO offending_id
      FROM "Offering" o
      JOIN "Property" p ON p."id" = o."propertyId"
     WHERE p."countryId" = NEW."id"
       AND o."currency" IS DISTINCT FROM NEW."currency"
     LIMIT 1;
    IF offending_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Country %s currency change would mismatch Offering %s currency', NEW."id", offending_id),
        ERRCODE = '23514',
        CONSTRAINT = 'Country_currency_consistency_check';
    END IF;

    SELECT v."id"
      INTO offending_id
      FROM "Conversion" v
     WHERE v."propertyId" IN (SELECT p."id" FROM "Property" p WHERE p."countryId" = NEW."id")
       AND v."firstPaymentCurrency" IS NOT NULL
       AND v."firstPaymentCurrency" IS DISTINCT FROM NEW."currency"
     LIMIT 1;
    IF offending_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Country %s currency change would mismatch Conversion %s currency', NEW."id", offending_id),
        ERRCODE = '23514',
        CONSTRAINT = 'Country_currency_consistency_check';
    END IF;

    SELECT m."id"
      INTO offending_id
      FROM "Commission" m
      JOIN "Conversion" v ON v."id" = m."conversionId"
      JOIN "Property" p ON p."id" = v."propertyId"
     WHERE p."countryId" = NEW."id"
       AND m."currency" IS DISTINCT FROM NEW."currency"
     LIMIT 1;
    IF offending_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Country %s currency change would mismatch Commission %s currency', NEW."id", offending_id),
        ERRCODE = '23514',
        CONSTRAINT = 'Country_currency_consistency_check';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS "Offering_property_currency_consistency" ON "Offering";
CREATE TRIGGER "Offering_property_currency_consistency"
BEFORE INSERT OR UPDATE OF "propertyId", "currency" ON "Offering"
FOR EACH ROW
EXECUTE FUNCTION enforce_property_currency_consistency();

DROP TRIGGER IF EXISTS "Conversion_property_currency_consistency" ON "Conversion";
CREATE TRIGGER "Conversion_property_currency_consistency"
BEFORE INSERT OR UPDATE OF "propertyId", "firstPaymentCurrency" ON "Conversion"
FOR EACH ROW
EXECUTE FUNCTION enforce_property_currency_consistency();

DROP TRIGGER IF EXISTS "Commission_property_currency_consistency" ON "Commission";
CREATE TRIGGER "Commission_property_currency_consistency"
BEFORE INSERT OR UPDATE OF "conversionId", "currency" ON "Commission"
FOR EACH ROW
EXECUTE FUNCTION enforce_property_currency_consistency();

DROP TRIGGER IF EXISTS "Property_currency_consistency" ON "Property";
CREATE TRIGGER "Property_currency_consistency"
BEFORE UPDATE OF "countryId" ON "Property"
FOR EACH ROW
WHEN (OLD."countryId" IS DISTINCT FROM NEW."countryId")
EXECUTE FUNCTION enforce_property_currency_consistency();

DROP TRIGGER IF EXISTS "Country_currency_consistency" ON "Country";
CREATE TRIGGER "Country_currency_consistency"
BEFORE UPDATE OF "code", "currency" ON "Country"
FOR EACH ROW
WHEN (OLD."code" IS DISTINCT FROM NEW."code" OR OLD."currency" IS DISTINCT FROM NEW."currency")
EXECUTE FUNCTION enforce_property_currency_consistency();
