# Backup and restore runbook

## Scope and targets

Back up PostgreSQL (system of record), Redis (rebuildable queues/session state), and MinIO/S3 objects (media and evidence). Target RPO: 24 hours for database and object storage, 1 hour for Redis if session continuity is required. Target RTO: 4 hours for a regional recovery.

## Daily backup

1. Set `BACKUP_DIR` to a new, encrypted host directory with restricted permissions; never use the application working directory.
2. Dump PostgreSQL in custom format and include globals:

   ```sh
   pg_dump --format=custom --no-owner --file="$BACKUP_DIR/betna-$(date -u +%Y%m%dT%H%M%SZ).dump" "$DATABASE_URL"
   pg_dumpall --globals-only --file="$BACKUP_DIR/globals-$(date -u +%Y%m%dT%H%M%SZ).sql"
   ```

3. Sync MinIO buckets with server-side encryption and object versioning enabled. Record the source bucket, destination, object count, and checksum manifest.
4. Snapshot Redis only when session/queue continuity is required; otherwise document that Redis will be rebuilt and jobs replayed from durable records.
5. Encrypt backups before transfer, upload to a separate account/region, restrict access to the recovery role, and record the backup timestamp and retention expiry.

## Restore rehearsal

1. Announce a recovery exercise and create an isolated PostgreSQL/MinIO/Redis environment. Never restore over production first.
2. Restore globals, then the custom PostgreSQL dump:

   ```sh
   psql "$RECOVERY_DATABASE_URL" < globals.sql
   pg_restore --clean --if-exists --no-owner --dbname="$RECOVERY_DATABASE_URL" betna.dump
   ```

3. Restore object versions and verify the checksum manifest. Recreate Redis, then run pending migrations with `prisma migrate deploy`.
4. Set recovery secrets, start the API and web images, and verify both health probes plus the critical flow. Check row counts, latest audit events, media reads, and queue consumers.
5. Record restore duration, recovered backup IDs, checksum mismatches, and follow-up actions. Destroy the isolated credentials and temporary environment after sign-off.

## Emergency production recovery

Declare the incident, freeze writes if corruption is ongoing, preserve logs/audit records, and obtain the incident commander’s approval before destructive restore. Choose the newest verified backup before the incident, communicate expected data loss, restore to a new database/buckets, validate the application, then switch connections. Keep the original resources read-only until evidence is preserved and the incident commander closes the recovery.
