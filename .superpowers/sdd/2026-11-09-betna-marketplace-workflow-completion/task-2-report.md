# Task 2 report: preserve approved snapshots and isolate listing media

Implemented the public discovery and media-boundary fixes for material edits.

- Search and slug lookup now consider `PUBLISHED` and `PENDING_REVIEW` rows;
  the publishing projection still requires an approved snapshot and current
  verification, so paused, fraud-review, expired, and snapshot-less rows stay
  hidden.
- Approved snapshots persist the media safety metadata needed to re-project
  them without trusting the edited property row. Public projection accepts
  only same-property `LISTING` media that is `CLEAN`, public, keyed below
  `public/listings/<propertyId>/`, and has safe derivative paths.
- Material-edit media IDs are resolved inside the existing transaction and
  must all exist for the exact property, be clean public listing media, and
  pass the same prefix/derivative checks before the relation update is built.
- Added discovery state-combination coverage, invalid/cross-property/private
  media regressions, and approved-snapshot projection coverage.

Verification:

- `pnpm --filter @betna/api typecheck` — passed.
- Focused publishing suite — 22 tests passed.
- Changed-file ESLint — passed.
- `pnpm --filter @betna/api test` — 186 passed, 14 skipped; the existing
  `src/runtime-validation.http.spec.ts` listener test failed because this
  restricted environment cannot bind `127.0.0.1` (`listen EPERM`).

