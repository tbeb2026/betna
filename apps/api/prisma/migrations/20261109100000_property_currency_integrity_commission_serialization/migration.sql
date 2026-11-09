-- The first currency guard checked a Conversion's own currency but did not
-- re-check linked commissions when a conversion moved. This replacement also
-- locks the Conversion row in the Commission path so conversion changes and
-- commission writes observe one serialized relationship.
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
    -- An UPDATE already owns the conversion row's UPDATE lock. Re-acquire a
    -- compatible lock explicitly so this path has the same parent-first lock
    -- order as Commission writes; INSERT has no visible parent row yet.
    IF TG_OP = 'UPDATE' THEN
      PERFORM 1
        FROM "Conversion" v
       WHERE v."id" = NEW."id"
       FOR KEY SHARE;
    END IF;

    SELECT c."currency"
      INTO expected_currency
      FROM "Property" p
      JOIN "Country" c ON c."id" = p."countryId"
     WHERE p."id" = NEW."propertyId"
     FOR KEY SHARE OF p, c;

    -- A conversion move or currency update must not strand any linked
    -- commission, including when firstPaymentCurrency itself is NULL.
    SELECT m."id"
      INTO offending_id
      FROM "Commission" m
      JOIN "Conversion" v ON v."id" = NEW."id"
      JOIN "Property" p ON p."id" = NEW."propertyId"
      JOIN "Country" c ON c."id" = p."countryId"
     WHERE m."conversionId" = NEW."id"
       AND m."currency" IS DISTINCT FROM expected_currency
     LIMIT 1;
    IF offending_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        MESSAGE = format('Conversion %s linked Commission %s currency does not match property country currency %s', NEW."id", offending_id, coalesce(expected_currency, '<unavailable>')),
        ERRCODE = '23514',
        CONSTRAINT = 'Conversion_property_currency_check';
    END IF;

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
    -- Lock the conversion before reading its property. Conversion UPDATEs use
    -- the same conversion-first order, so neither path can pass a stale check.
    SELECT c."currency"
      INTO expected_currency
      FROM "Conversion" v
      JOIN "Property" p ON p."id" = v."propertyId"
      JOIN "Country" c ON c."id" = p."countryId"
     WHERE v."id" = NEW."conversionId"
     FOR KEY SHARE OF v, p, c;

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
