# Task 3 report: validate all body UUID references

Implemented strict transport validation for database identifiers in body DTOs.

## Inventory and changes

- Property create/update: `countryId`, `cityId`, and `neighborhoodId` now require
  UUID v4 values. The documented `countryCode` (`KE`/`UG`) remains a separate
  country-code contract.
- Guest inquiries and contact clicks: `propertyId` and optional `offeringId`
  require UUID v4 values.
- Conversion reports and ownership changes: `inquiryId` and `newOwnerId`
  require UUID v4 values.
- Publishing material edits: `media`, `mediaIds`, and `corePhotos` require
  UUID v4 values for every array element (`each: true`).
- Media upload targets: optional `propertyId` and `inspectionId` require UUID
  v4 values.
- Inspection assignment/evidence and unavailable-date creation: verifier,
  evidence media, and property references require UUID v4 values. Nested
  inspection evidence is validated through the existing nested DTO pipeline.

Representative listener-backed Nest HTTP tests cover malformed identifiers,
malformed UUID array elements, service non-invocation on 400 responses, and
valid UUID requests continuing to the service layer.

## Verification

- `pnpm --filter @betna/api lint` — passed.
- `pnpm --filter @betna/api typecheck` — passed.
- `pnpm --filter @betna/api exec vitest run src/uuid-validation.http.spec.ts` —
  14 tests passed. Requires localhost binding outside the restricted sandbox.
- `pnpm --filter @betna/api test` — passed (full API suite; 14 new UUID HTTP
  tests included).
