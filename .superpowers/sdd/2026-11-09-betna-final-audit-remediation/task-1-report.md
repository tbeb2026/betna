# Task 1 report — verified owner onboarding and durable checklist injection

## Result

Implemented Task 1 on `feat/betna-mvp`.

Owner onboarding now has explicit owner phone OTP request, email verification
request/confirmation, throttled email challenges, authorization attestation, and
activation only after both channels are verified. Email codes are delivered via
the injected `NotificationService` boundary; failed delivery rows are surfaced as
errors, and missing production adapters continue to fail rather than silently
accepting a verification request. Email challenges are persisted in the new
`EmailVerificationChallenge` table when Prisma is available.

Inspection services now receive `AssignmentsService`, `ChecklistService`, and
`AuditService` through the Nest verification module. The service no longer
constructs a fallback in-memory checklist. Submission and admin review both load
the published persisted definition for the property category, and submissions
retain the definition version on the inspection. Checklist admin endpoints also
use the injected provider directly.

The localized owner onboarding form now exposes request buttons for WhatsApp and
email verification, plus an email verification code field. The browser test
asserts those controls.

## Tests and verification

- `pnpm test` — passed, 24 files / 145 tests.
- `pnpm typecheck` — passed for all six workspace packages.
- `pnpm --filter @betna/api lint` — passed.
- `pnpm --filter @betna/web lint` — passed.
- `pnpm --filter @betna/web exec playwright test e2e/auth-onboarding.spec.ts --list` — passed; one browser test discovered.
- `git diff --check` — passed.
- `DATABASE_URL=postgresql://betna:betna@localhost:5432/betna pnpm --filter @betna/api prisma validate --schema prisma/schema.prisma` — passed.

The focused API tests cover WhatsApp OTP request, missing email verification,
valid email/phone/attestation activation, email request throttling, failed
notification delivery, and persisted checklist requirements during submission
and review.

## Caveat

The Playwright browser run could not start its Next server in this restricted
environment (`listen EPERM` on ports 3000/3100). The test file parses and lists
correctly, but an actual browser execution remains an environment/CI gate.

## Fix round 1 — final-audit findings

The follow-up audit findings are addressed as follows:

- Notification provider failures now return a durable `FAILED` delivery row
  from `NotificationService`; onboarding rejects every non-terminal delivery
  status instead of treating `PROCESSING` as success. Failed delivery does not
  create an email challenge, so a retry does not consume the email request
  limit.
- Checklist review loads the exact persisted definition identified by
  `inspection.checklistVersion`, including historical unpublished versions.
  Missing persistence or a missing/invalid category definition now raises an
  explicit configuration error; the production path has no baseline in-memory
  fallback. Test repositories now provide persisted fake definitions.
- OTP and email challenge confirmation use conditional atomic `updateMany`
  operations (`consumedAt IS NULL`, `attempts < maxAttempts`, and expiry
  checks), with per-instance serialization for mocked/in-memory stores. OTP
  challenges are removed when a provider fails after persistence.
- Owner onboarding labels, action messages, success messages, and known API
  errors now come from both `en` and `ti` message catalogs.
- The onboarding Playwright test now performs browser-side request fixtures for
  WhatsApp OTP request, email request/confirmation failure and success, failed
  activation, and successful activation, alongside real form interaction.

### Fix-round verification

- `pnpm test` — passed, 26 files / 155 tests.
- `pnpm typecheck` — passed for all workspace packages.
- `pnpm --filter @betna/api lint` — passed.
- `pnpm --filter @betna/web lint` — passed.
- `pnpm --filter @betna/web exec playwright test e2e/auth-onboarding.spec.ts --list` — passed; two browser tests discovered.
- `git diff --check` — passed.
- An actual Playwright run remains blocked by the restricted environment: Next
  cannot bind its web-server port (`listen EPERM`), matching the existing caveat.

## Fix round 2 — re-review findings

- Email verification requests now accept only a confirmed `SENT` notification
  delivery. Retryable `QUEUED`/`PROCESSING`/other nonterminal statuses fail the
  request before the challenge is persisted or the email rate-limit budget is
  recorded, so the owner can retry without consuming a verification attempt.
- The onboarding browser test now drives the visible request buttons and the
  create-account form through Next server actions. It asserts the localized
  failure state, successful redirect, and `httpOnly` session cookie. A small
  Playwright web-server mock provides deterministic auth API responses and
  proxies unrelated API traffic; the test no longer calls `fetch` through
  `page.evaluate`.

### Fix-round 2 verification

- `pnpm vitest run apps/api/src/auth/auth.service.spec.ts apps/web/src/lib/api-client.test.ts` — passed, 22 tests.
- `pnpm --filter @betna/web exec playwright test e2e/auth-onboarding.spec.ts --list` — passed; two browser tests discovered.
- `node --check apps/web/e2e/mock-auth-api.mjs` — passed.
- `git diff --check` — passed.
- An actual Playwright run remains blocked by this restricted environment:
  the mock server cannot bind `127.0.0.1:4400` (`listen EPERM`).

## Fix round 3 — notification response validation

- Email verification requests now require `NotificationService.enqueue` to
  return a non-empty array whose every entry explicitly has
  `status === "SENT"`. `undefined`, `[]`, `[undefined]`, `[{}]`, and any
  response containing another status are rejected before the request budget is
  recorded or an email challenge is created.
- The rate-limit test and onboarding notification mock now model the real
  successful delivery response with `[{ status: "SENT" }]` instead of relying
  on an empty or undefined mock result.
- Direct regressions cover each malformed response above and a normal response
  containing only `SENT` entries. Each malformed case retries successfully on
  the next `SENT` response, proving the failed request did not consume budget.

### Fix-round 3 verification

- `pnpm vitest run apps/api/src/auth/auth.service.spec.ts` — passed, 22 tests.
- `pnpm test` — passed, 26 files / 161 tests.
- `git diff --check` — passed.
