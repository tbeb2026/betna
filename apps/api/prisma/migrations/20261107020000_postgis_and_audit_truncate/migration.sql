-- PostGIS is installed by the PostGIS PostgreSQL image but must be enabled in
-- each application database before a geometry column can be created.
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE "Property"
ADD COLUMN "exactLocationGeometry" geometry(Point,4326);

-- Row-level UPDATE/DELETE protection is installed by the initial migration.
-- TRUNCATE bypasses row-level triggers, so it needs a statement-level trigger.
CREATE TRIGGER audit_event_immutable_truncate
BEFORE TRUNCATE ON "AuditEvent"
FOR EACH STATEMENT
EXECUTE FUNCTION prevent_audit_event_mutation();
