# Task 2 report: shared contracts, database, and seed geography

## Outcome

Implemented the durable launch-domain foundation for Kenya and Uganda.

- Shared TypeScript contracts cover launch country/currency mapping (`KE/KES`, `UG/UGX`), rental modes, listing/inquiry/verification/commission statuses, public property projections, guest inquiries, and inspection summaries.
- Prisma PostgreSQL schema uses UUID primary keys and timestamped entities for users, roles, territories, cities, neighborhoods, properties, offerings, media, inspections, inquiries, conversions, commissions, and audit events.
- Property public map coordinates and label are separate from nullable private exact address/coordinates.
- Audit events have no update timestamp and the initial migration adds a PostgreSQL trigger rejecting updates and deletes.
- Seed is idempotent and creates launch countries, roles, Nairobi/Kampala territories and cities, and initial neighborhoods.
- Prisma module/service provide a NestJS lifecycle-managed client.

## TDD evidence

The required seed test was written before the implementation and initially failed during test collection because `./seed` did not exist. After implementation, it passed against a clean migrated PostgreSQL/PostGIS database.

## Verification

Commands run:

- `DATABASE_URL=postgresql://betna:betna-local-password@localhost:55432/betna pnpm --filter @betna/api exec prisma migrate reset --force --skip-seed` — passed; applied the clean initial migration, including the audit immutability trigger.
- `DATABASE_URL=postgresql://betna:betna-local-password@localhost:55432/betna pnpm --filter @betna/api prisma:seed` — passed; seed is runnable from the package script.
- `DATABASE_URL=postgresql://betna:betna-local-password@localhost:55432/betna pnpm --filter @betna/api test prisma/seed.test.ts` — passed, 2/2 tests.
- `pnpm --filter @betna/contracts typecheck` — passed.
- `pnpm --filter @betna/api typecheck` — passed.
- `DATABASE_URL=postgresql://betna:betna-local-password@localhost:55432/betna pnpm test` — passed, 8/8 tests. The isolated database was used because the pre-existing repository PostgreSQL container had no host port mapping.

## Files

- `packages/contracts/src/enums.ts`
- `packages/contracts/src/property.ts`
- `packages/contracts/src/inquiry.ts`
- `packages/contracts/src/verification.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/tsconfig.json`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20261107010000_init/migration.sql`
- `apps/api/prisma/seed.ts`
- `apps/api/prisma/seed.test.ts`
- `apps/api/src/prisma/prisma.module.ts`
- `apps/api/src/prisma/prisma.service.ts`
- `apps/api/tsconfig.json`
- `apps/api/package.json` (Prisma seed command metadata)

## Concerns / follow-up

- The schema keeps currencies as short strings on persisted geography/offering rows so future countries and currencies remain extensible; API validation should enforce the launch contract mapping when accepting property data.
- The migration includes PostgreSQL/PostGIS compatibility through the selected image. Exact coordinates are represented by private decimal input/read columns plus the private PostGIS geometry column added in the review migration.
- Seed integration tests require `DATABASE_URL`; CI should provide a database URL to execute them.

## Round 1 review fixes

- Added `Property.exactLocationGeometry` as a private `geometry(Point,4326)` PostGIS column and enabled the `postgis` extension in the initial migration. The existing exact decimal fields remain available as a normalized input/read representation; public approximate coordinates remain separate.
- Added a statement-level `BEFORE TRUNCATE` trigger in addition to the row-level update/delete trigger, making `AuditEvent` append-only for all table mutation paths covered by PostgreSQL triggers.
- Removed the seed-test skip. The test now fails clearly with `DATABASE_URL is required to run apps/api/prisma/seed.test.ts` when no database is configured.
- Added regression coverage for UUID column types, public/private location columns, PostGIS extension availability, and update/delete/truncate audit immutability.

Round 1 verification:

- With a clean isolated PostGIS database, migration reset and all 5 seed/database contract tests passed.
- With `DATABASE_URL` unset, the seed test fails immediately with the explicit configuration error above rather than silently skipping.
