# Task 5 report: owner property submissions and taxonomy

## Delivered

- Added `PropertiesService.createDraft(ownerId, input)`, `updateDraft(propertyId, ownerId, patch)`, `submit(propertyId, ownerId)`, owner listing retrieval, and a public projection that omits exact address/coordinates.
- Enforced individual-owner access using the persisted `OWNER` role; agent/business roles cannot create or manage listings.
- Enforced launch geography currency rules (`KE`/`KES`, `UG`/`UGX`), positive mandatory public prices, one offering per rental mode, and separate short-stay/long-term fields.
- Added managed residential, land, and commercial category/subcategory taxonomy plus a taxonomy endpoint.
- Persisted managed `Property.subcategory`, private exact address/coordinates, approximate public location, authorization attestation, and nested offerings through Prisma.
- Added authenticated owner API routes and localized owner pages for listing management, new submissions, and draft editing. The mobile-first form keeps exact address private, displays local currencies, exposes both rental modes separately, and requires authorization attestation.
- Serialized Playwright portal smoke tests because concurrent Next dev manifest writes made the baseline suite flaky during first compilation.

## TDD evidence

- `properties.service.spec.ts` was created before the service and initially failed at collection because `properties.service` did not exist.
- The API suite now covers multi-property ownership, required public pricing, separate offerings, currency mismatch rejection, public/private location projection, authorization submission, and role denial.
- `owner-submission.spec.ts` was created before the owner property routes and verifies the localized owner form fields and both rental modes.

## Verification

- `pnpm --filter @betna/api test properties` — PASS (5 tests)
- `pnpm --filter @betna/api test -- src/auth/auth.service.spec.ts src/main.test.ts` — PASS (11 tests)
- `pnpm --filter @betna/api test:e2e -- auth` — PASS (3 tests)
- `pnpm --filter @betna/api typecheck` — PASS
- `pnpm --filter @betna/api build` — PASS
- `DATABASE_URL=postgresql://user:pass@localhost:5432/betna pnpm --filter @betna/api exec prisma validate` — PASS
- `pnpm --filter @betna/web typecheck` — PASS
- `pnpm --filter @betna/web build` — PASS
- `pnpm --filter @betna/web test:e2e -- owner-submission` — PASS (3 tests: owner submission plus existing portal checks)
