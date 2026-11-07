# Task 7 recovery report

Date: 2026-11-08

## Scope reviewed

The inherited Task 7 implementation was already committed at `5c0df63` (`feat: add territory verification and offline inspections`). I preserved it, reviewed the API, web queue, routes, Prisma model usage, and tests, then added the recovery hardening below.

## Changed files

The baseline Task 7 commit (`5c0df63`) added:

- API verification module, assignment/checklist/inspection services, controller, and service tests.
- Verification Prisma integration through the existing `Inspection`, `InspectionEvidence`, `Media`, territory, and status models.
- Encrypted browser offline queue, inspection form, upload status, verifier routes, admin verification route, and offline Playwright coverage.
- App-module registration.

Recovery commits changed or added:

- `apps/api/src/verification/assignments.service.ts` — always applies a territory allow-list; resolves persisted assignments when session territory context is absent.
- `apps/api/src/verification/inspections.service.ts` — validates required evidence membership, media existence/purpose/status/property, assigned-verifier sync access, and admin review decisions.
- `apps/api/src/verification/inspections.controller.ts` — exposes the missing admin `POST /verification/inspections/:id/assign` route and passes verifier identity during evidence sync.
- `apps/api/src/verification/inspections.service.spec.ts` — regression coverage for territory isolation, evidence membership/media validation, sync authorization, and invalid decisions.
- `apps/api/src/verification/inspections.controller.spec.ts` — admin assignment route coverage.
- `apps/web/src/features/verification/offline-queue.ts` — removes queue entries only after successful upload, retaining failed and later entries for retry; drops corrupt entries without blocking valid entries.
- `apps/web/src/features/verification/offline-queue.test.ts` — partial retry regression coverage.

## Verification

- `pnpm --filter @betna/api test verification` — PASS, 1 file / 9 tests.
- `pnpm --filter @betna/api test src/verification/inspections.controller.spec.ts src/verification/inspections.service.spec.ts` — PASS, 2 files / 10 tests.
- `pnpm --filter @betna/web test` — PASS, 4 files / 9 tests.
- `pnpm --filter @betna/api typecheck` — PASS.
- `pnpm --filter @betna/web typecheck` — PASS.
- `git diff --check` — PASS.

Blocked/environment-limited checks:

- Full `pnpm --filter @betna/api test` reached 49 passing tests but fails at the pre-existing `prisma/seed.test.ts`, which intentionally requires `DATABASE_URL`; no database URL is available in this environment.
- `pnpm --filter @betna/web test:e2e -- offline-inspection` cannot start the configured Next server because the sandbox denies binding `0.0.0.0:3000` (`listen EPERM`). A direct Playwright invocation has the same web-server failure.
- API lint cannot start because the repository has no ESLint 9 flat config (`eslint.config.js|mjs|cjs`). Web lint invokes deprecated interactive `next lint` and cannot run non-interactively.

## Commits

- `5c0df63` — `feat: add territory verification and offline inspections` (inherited Task 7 baseline).
- `49fc5d7` — `fix: harden verification territory and sync retries`.
- `03ea72a` — `feat: expose admin inspection assignment`.

## Remaining concerns

- Browser E2E and database-backed seed tests still need a permitted listening environment and configured PostgreSQL `DATABASE_URL` respectively.
- Checklist version values are held by the current in-process `ChecklistService`; durable checklist-definition history/admin editing is not yet modeled in Prisma.
- The MVP verifier/admin pages are presentation shells; the API service/controller lifecycle is implemented, but full queue fetching and review-assignment UI wiring remains future work.

## Self-verdict

- Spec compliance: **PASS for the Task 7 API lifecycle and encrypted offline queue**, with the E2E/database limitations above and the documented durable-checklist/UI follow-ups.
- Quality: **PASS for focused behavior and type safety**; API security boundaries and partial retry semantics are covered by regression tests. Full integration confidence remains conditional on database and browser-server access.

## Review correction pass (P1/P2)

The follow-up review identified five P1 gaps and a coupled checklist-versioning follow-up. The correction pass preserves the prior commits and addresses them as follows:

- Offline evidence now stores actual encrypted data URLs plus filename/content type/size metadata, obtains a media upload target, PUTs the evidence blob, completes media processing, submits the persisted media IDs, and calls each evidence sync endpoint. The queue is removed only after every upload, submit, and sync succeeds.
- Queue entries are deduplicated/replaced by inspection ID. Unsubmitted drafts remain local and are not flushed; a later draft save cannot downgrade an already-submitted operation. Partial media progress is encrypted back into the queue before continuing, so retry does not re-upload completed evidence.
- `Inspection.submissionRequestKey` is persisted and uniquely indexed. Repeated submission requests with the same key return the persisted inspection result instead of replacing evidence or creating a duplicate operation. Evidence sync remains restart-safe through persisted `InspectionEvidence` upserts and returns the existing READY/APPROVED result for repeated sync calls.
- Review transitions now require `READY_FOR_REVIEW` for both approval and rejection. Rejected inspections may be resubmitted; pending-upload inspections cannot be directly rejected or approved.
- Verifier inspection detail/list pages now load authenticated, territory-filtered API data. The admin page loads the READY_FOR_REVIEW queue and exposes authenticated approve/reject controls. A verifier detail endpoint supplies the property ID needed for evidence upload.
- `Inspection.checklistVersion` is persisted with each submission, using the active baseline/category checklist definition version.
- Service mocks now persist `InspectionEvidence` rows and media records, covering media-purpose/status/property validation and restart-like sync state. Controller tests verify the authenticated verifier identity is passed to sync.

Additional verification:

- `pnpm --filter @betna/api test src/verification/inspections.service.spec.ts src/verification/inspections.controller.spec.ts` — PASS, 2 files / 13 tests.
- `pnpm --filter @betna/web test` — PASS, 4 files / 11 tests.
- `pnpm --filter @betna/api typecheck` — PASS.
- `pnpm --filter @betna/web typecheck` — PASS.
- `pnpm --filter @betna/web build` — PASS; production Next build compiled, typechecked, and generated all routes.
- Updated `apps/web/e2e/offline-inspection.spec.ts` now exercises file selection and mocked upload/complete/submit/sync success through `Upload synced`; execution remains blocked by the sandbox’s server-bind restriction described above.

Correction-pass commits:

- `4c18572` — persisted idempotency, real offline evidence sync, functional queues/pages, checklist version, and review-transition fixes.

Updated self-verdict: **P1 review findings addressed in code and focused tests; integration E2E/database execution remains environment-blocked.**

## Review correction pass 2

Re-review regressions were fixed:

- A rejected inspection with the same stable request key now starts a new `PENDING_UPLOAD` submission; active/replayed submissions in DRAFT/PENDING_UPLOAD/READY/APPROVED retain idempotent identical-result behavior.
- Evidence-sync idempotent replay now performs assigned-verifier authorization before returning an existing READY/APPROVED result, preventing cross-verifier retrieval.
- Queue deduplication preserves the entire submitted payload and media progress when a later save-draft entry for the same inspection arrives; it cannot downgrade or overwrite the submitted operation.

Regression tests added cover all three cases. Focused API tests pass (13 inspection-service tests); focused offline queue tests pass (3 tests); API and web typechecks pass. Generated `apps/web/tsconfig.tsbuildinfo` was removed before commit.
