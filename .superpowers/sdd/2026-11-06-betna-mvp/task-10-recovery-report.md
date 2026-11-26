# Task 10 recovery report: notification claim fencing

## Fixed

- The retry worker now selects due `FAILED`, legacy `QUEUED`, and expired
  `PROCESSING` notifications. Fresh processing leases remain untouched.
- Each retry claim gets a new `processingToken`; terminal `SENT` and `FAILED`
  writes require the same row id, `PROCESSING` status, and token, so a stale
  worker cannot overwrite a newer claim.
- Channel adapters receive the persisted delivery `idempotencyKey` on every
  attempt. `docs/notifications.md` records the provider-idempotency contract
  and the unavoidable provider-accepted/DB-update crash window.

## Tests

- Added recovery coverage for all three claimable states and exclusion of a
  fresh processing row.
- Added success and failure token-fencing tests where another worker replaces
  the claim while the provider call is in flight.
- Focused notification tests: PASS (7 tests).
- API typecheck and build: PASS.
- Full API suite: 93 tests pass; the pre-existing `prisma/seed.test.ts` suite
  cannot start without `DATABASE_URL` in this sandbox.
