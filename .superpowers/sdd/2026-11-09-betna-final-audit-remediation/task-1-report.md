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
