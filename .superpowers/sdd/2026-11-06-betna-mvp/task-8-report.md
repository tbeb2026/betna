# Task 8 report — publishing, re-verification, translations, and lifecycle jobs

## Verdict

Implemented and self-reviewed. The scoped Task 8 behavior is complete: verified listings can be published, approved public snapshots survive material edits under review, expiry and fraud immediately remove listings from public projection, ownership changes force re-verification, and approved translations support English publication while Tigrinya remains pending.

## Files

- `apps/api/src/properties/publishing.service.ts` — publication state machine, immutable approved snapshots, public-safe projection, material edit review, fraud pause, verification expiry, renewal candidates, ownership-change re-verification, and publishing queue.
- `apps/api/src/properties/translation.service.ts` — approved/pending translation upsert, English fallback, locale validation, and staff queue.
- `apps/api/src/properties/listing-lifecycle.job.ts` — expiry and renewal-candidate job boundary.
- `apps/api/src/properties/publishing.controller.ts` — admin publishing, fraud, material-edit, translation queue, and translation approval endpoints.
- `apps/api/src/properties/properties.module.ts` — registers and exports Task 8 services/controllers.
- `apps/api/prisma/schema.prisma` — adds `PropertyVersion`, `PropertyTranslation`, and `Property.fraudReason`.
- `apps/api/prisma/migrations/20261108020000_publishing_lifecycle/migration.sql` — schema migration for lifecycle persistence.
- `apps/api/src/properties/publishing.service.spec.ts` — required lifecycle tests.
- `apps/web/src/app/[locale]/admin/publishing/page.tsx` — admin publishing queue page.
- `apps/web/src/app/[locale]/admin/translations/page.tsx` — admin translation queue page.

## Tests and verification

- `pnpm --filter @betna/api test publishing` — PASS, 5/5.
- `pnpm --filter @betna/api typecheck` — PASS.
- `pnpm --filter @betna/api build` — PASS.
- `pnpm --filter @betna/web typecheck` — PASS.
- `pnpm --filter @betna/web test` — PASS, 12/12.
- `pnpm --filter @betna/web build` — PASS.
- `pnpm --filter @betna/api test` — 60/60 tests passed; the aggregate command exits non-zero because the pre-existing `prisma/seed.test.ts` requires `DATABASE_URL` and no database URL is configured in this environment.
- `pnpm --filter @betna/api lint` — blocked by repository tooling: ESLint 9 cannot find an `eslint.config.(js|mjs|cjs)` flat config.

The required RED step was observed before implementation: `pnpm --filter @betna/api test publishing` failed because the publishing service modules did not exist. The same command then passed after implementation.

## Commit

- `9ad6c1c99f164c84915d56e7273cd160b5d80cd8` — `feat: add listing publication and verification lifecycle`

## Concerns / deferred

- Full Prisma migration/seed execution was not possible without a live PostgreSQL `DATABASE_URL`; schema validation passed with a placeholder PostgreSQL URL.
- Renewal reminders currently expose deterministic candidates through `ListingLifecycleJob`; delivery is intentionally left to the notifications job introduced by a later task.
- Aggregate API test and lint failures are environment/repository setup issues described above, not failures in Task 8 scoped tests.

## Self-review

- No Critical or Important findings in the scoped diff after reviewing the lifecycle transitions, public projection boundary, translation fallback, module registration, migration, and tests.
- Review limitation: this was an author self-review because no reviewer subagent was available in this task context.

## Recovery fix report — 2026-11-08

The review follow-up is addressed in the working tree:

- `PublishingService` and `TranslationService` now use Nest's typed `PrismaService` token; `PropertiesModule` explicitly imports `PrismaModule`.
- `PropertyVersion.approvedBy` is now present in both Prisma schema and the lifecycle migration.
- Public projections reject expired `PUBLISHED` and pending-review listings, retain the approved snapshot only while current verification is valid, and expose verification badge/inspection metadata.
- Approved locale content is applied to public projections (including Tigrinya); pending Tigrinya content keeps the requested locale while falling back to English content.
- Material edit detection covers price/offering, core media, exact location, category, capacity/bedroom, amenities, and inspection facts, while text-only edits do not trigger re-review.
- Lifecycle expiry/reminder work runs once at module initialization and on a daily interval with cleanup on shutdown.
- Ownership re-verification is exposed as an admin route and validates admin authorization plus an active individual owner before clearing inspection validity.
- Added persistence-across-service-instance, expiry, translation, material-edit, ownership, lifecycle scheduling, and Nest module bootstrap regressions.

Verification:

- `pnpm --filter @betna/api test publishing` — PASS, 13/13.
- `pnpm --filter @betna/api typecheck` — PASS.
- `pnpm --filter @betna/api build` — PASS.
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/betna pnpm --filter @betna/api prisma validate` — PASS.
- `pnpm --filter @betna/web typecheck` — PASS.
- `pnpm --filter @betna/web test` — PASS, 12/12.
- Full API suite: 67/67 tests passed; suite exits non-zero because the pre-existing `prisma/seed.test.ts` requires `DATABASE_URL` and no database is configured.

## Round 2 recovery — 2026-11-08

The second review's P1 findings are addressed:

- Every call to `publish()` now writes a new immutable `PropertyVersion`, increments from the latest persisted version, and retires the prior approved version. A fresh service instance therefore reads the latest approved snapshot during pending review rather than stale in-process state.
- `createMaterialEditReview()` now persists every supported detected material change: scalar property fields and exact-location aliases, complete offering replacements or price updates, media/core-photo relation sets, and inspection facts (`bedrooms`, `capacity`, and `safetyNotes`) in the new `Property.materialFacts` JSON column. Text-only fields continue to be persisted without forcing review.
- `reverifyOwnershipChange()` and `transferOwnership()` require an actor at the type and runtime boundaries and reject missing/non-admin actors before changing ownership. The admin controller passes the authenticated actor through.
- Added migration `20261108030000_property_material_facts` without modifying the already-applied lifecycle migration.

Round 2 verification:

- `pnpm --filter @betna/api test publishing` — PASS, 15/15.
- `pnpm --filter @betna/api typecheck` — PASS.
- `pnpm --filter @betna/api build` — PASS.
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/betna pnpm --filter @betna/api prisma validate` — PASS.
- Full API suite — 70/70 tests passed; command exits non-zero only because the pre-existing `prisma/seed.test.ts` requires `DATABASE_URL` and no database is configured.
