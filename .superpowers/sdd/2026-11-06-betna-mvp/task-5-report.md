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

- `pnpm --filter @betna/api test properties` — PASS (13 tests: 12 service, 1 controller)
- `pnpm --filter @betna/api test -- src/auth/auth.service.spec.ts src/main.test.ts` — PASS (11 tests)
- `pnpm --filter @betna/api test:e2e -- auth` — PASS (3 tests)
- `pnpm --filter @betna/api typecheck` — PASS
- `pnpm --filter @betna/api build` — PASS
- `DATABASE_URL=postgresql://user:pass@localhost:5432/betna pnpm --filter @betna/api exec prisma validate` — PASS
- `pnpm --filter @betna/web typecheck` — PASS
- `pnpm --filter @betna/web build` — PASS
- `pnpm --filter @betna/web test` — PASS (8 tests)
- `pnpm --filter @betna/web exec playwright test e2e/owner-submission.spec.ts --project=chromium` — PASS (2 tests; required elevated local-server socket permission)

## Takeover hardening

The worktree already contained the initial Task 5 commit (`134d832`) while the
SDD ledger still marked the task incomplete. I reviewed it as untrusted and
added regression coverage and fixes in `d2a87da`:

- Explicit `countryId` values are checked against the submitted country code
  and managed country currency instead of bypassing geography validation.
- Draft updates load the country relation, preserving Uganda (`UG`/`UGX`) when
  the patch omits `countryCode`.
- Prisma `Decimal` offering prices are normalized before draft updates, so
  persisted drafts can be edited successfully.
- Missing subcategories and unsupported rental modes now fail with a 400-level
  validation exception before persistence.

The hardening cycle followed red-green verification: the five regression cases
failed against the baseline, then passed after the minimal fixes. The final
properties suite has 13 passing tests (12 service tests and one controller
test).

## Round 1 recovery

Commit `eeb40e3` completed the owner workflow wiring that was missing from the
initial UI implementation:

- Added authenticated server actions for taxonomy/geography loading, owner
  portfolio retrieval, draft retrieval, draft creation, draft edits, and
  submit-for-review actions. Draft edits use the API `PATCH` client method.
- Added the managed geography API endpoint and stable city options. The form
  now submits a managed city ID, derives the country currency, and keeps
  subcategories synchronized with the selected category.
- Added public approximate latitude/longitude and private exact address and
  latitude/longitude fields. The form derives distinct starter exact
  coordinates, while the API rejects a public pin that exactly exposes the
  private pin.
- Replaced the placeholder portfolio and edit routes with owner API-backed
  data boundaries and prefilled draft forms. Added browser coverage for the
  portfolio/edit routes, managed city options, coordinate fields, and dynamic
  taxonomy selection.
- Added parser/API-client unit coverage for managed city/country payloads,
  numeric coordinate payloads, authenticated draft patches, and rejected city
  choices. The API controller/service suite and web unit suite are now included
  in the verification counts above.

## Self-review and known repository-wide blockers

Self-review of the Task 5 range (`b8f0840..eeb40e3`) found no remaining
critical or important issues within the task scope. `git diff --check` and the
changed-file Prettier check pass. The repository-wide `pnpm test` was also run;
30 tests passed, but collection fails on pre-existing infrastructure boundaries:

- `apps/api/prisma/seed.test.ts` requires `DATABASE_URL` and no database was
  configured in this environment.
- Root Vitest collects Playwright files under `apps/web/e2e`, producing
  `Playwright Test did not expect test() to be called here`; the dedicated
  Playwright command passes independently.
