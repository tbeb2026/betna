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
- The migration includes PostgreSQL/PostGIS compatibility through the selected image, but exact coordinates are currently represented as private decimal columns. A future spatial query migration can add a private PostGIS geometry column without changing the public projection.
- Seed integration tests skip when `DATABASE_URL` is absent so the repository’s no-infrastructure test command remains runnable; CI should provide a database URL to execute them.
