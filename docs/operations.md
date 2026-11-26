# Betna operations

## Health and alerts

- API liveness: `GET /health/live` (process-only; Kubernetes restart probe).
- API readiness: `GET /health/ready` (database dependency; remove from traffic on HTTP 503).
- Web health: `GET /api/health` (proxies API readiness; HTTP 503 when the API is unavailable).
- Alert on readiness failures for 2 consecutive minutes, container restarts, database connection saturation, Redis queue age, notification retry growth, and backup age over 24 hours.

The API emits one JSON object per log line. Include `service=betna-api`, level, timestamp, status, method, and path in dashboards. Do not add request bodies or credentials to logs.

The database migrations `20261109070000_property_currency_integrity` and
`20261109100000_property_currency_integrity_commission_serialization` are the
authoritative currency guard: PostgreSQL rejects direct writes to offerings,
conversions, and commissions when their currency does not match the related
property country (Kenya/KES or Uganda/UGX). A conversion property move or
first-payment-currency update also checks every linked commission. The
conversion trigger and commission trigger acquire locks in conversion-then-
property/country order. If transaction A moves a conversion while transaction
B inserts or updates its commission, B waits on the conversion row and then
checks A's committed destination, so no stale-currency commission can commit.
The follow-on migration preflights existing Conversion and linked Commission
rows before replacing the trigger, including commissions linked to a conversion
whose first-payment currency is NULL; any mismatch aborts deployment with a
constraint error for data correction. The database race fixture coordinates
transactions with an advisory lock and observes `pg_stat_activity` for the
expected row-lock wait, so it does not rely on `pg_sleep` timing.
Apply migrations before starting the API and treat a migration failure caused
by existing mismatches as a data correction incident; do not bypass the trigger
with application-side writes.

## Deployment

1. Confirm the CI workflow is green, the migration is backward compatible, and the release owner has a rollback decision and maintenance window.
2. Build and publish immutable `betna-api:<git-sha>` and `betna-web:<git-sha>` images. Scan images and dependencies; do not deploy a mutable `latest` tag.
3. Apply production environment variables from the secret manager. The API refuses to boot if required production values are missing or unsafe.
4. Run `pnpm --filter @betna/api prisma migrate deploy` from a migration job using the migration database credential. Never run `migrate dev` in production.
5. Roll out the API with readiness checks, then the web image. Verify `/health/live`, `/health/ready`, `/api/health`, public search, guest inquiry, owner response, and the admin commission flow.
6. Watch errors, latency, queue age, and database health for at least 15 minutes. Record image digests, migration IDs, operator, and verification results.

To roll back an application regression, route traffic to the last known-good image digest and keep forward-compatible migrations in place. Do not automatically downgrade or delete a database migration; use the restore runbook for destructive schema/data recovery.

## Routine maintenance

- Daily: verify backup success and age, inspect readiness and queue alerts, and review failed notification/media jobs.
- Weekly: test restore into an isolated environment, review dependency/image findings, and check audit-log retention.
- Monthly: rotate credentials as scheduled, review access and role assignments, and exercise the incident contact tree.

## Database integration gate

Run `pnpm test:db` (or `pnpm test:integration`) against an isolated
PostgreSQL/PostGIS database after migrations. This gate validates the durable
schema, immutable audit trigger, and direct-SQL property currency triggers;
unit tests use transactional fakes and structural migration assertions when a
database is unavailable. If no database is available locally, run
`pnpm --filter @betna/api exec vitest run src/prisma/currency-integrity-migration.spec.ts`
and record the skipped `pnpm test:db` gate; CI must still run the full database
gate after `prisma migrate deploy`. Run the browser release gate separately with
`pnpm test:playwright`, or run both API and browser end-to-end suites with
`pnpm test:e2e` after the required services are available.

The browser gate always runs `apps/web/e2e/guest-inquiry.spec.ts` against the
seeded `verified-kilimani-home` fixture; it does not use an environment flag to
silently skip the required guest path. The critical inquiry-to-commission flow
is a separate credentialed path and runs when `BETNA_CRITICAL_FLOW_E2E=1` (as
configured in CI); local runs must provide the seeded API and role sessions.

## SLO starting points

Target 99.5% monthly availability for public search and inquiry submission, with API readiness as the primary availability signal. Page on-call for a sustained 5xx rate above 2%, readiness unavailable for 2 minutes, or a queue older than 15 minutes. Product owners decide whether a degraded inquiry path is acceptable during an incident.
