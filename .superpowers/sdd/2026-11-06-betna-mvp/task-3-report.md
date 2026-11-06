# Task 3 report: identity, authorization, and audit boundaries

## Delivered

- Added `AuthService` password sign-in with scrypt-hashed credentials, normalized emails, active-account checks, opaque server-side sessions, expiration, and revocation.
- Added phone OTP requests/verifications with salted hashed codes, expiry, failed-attempt invalidation, configurable request/attempt throttles, and a `WhatsAppProvider` adapter boundary (with a no-op default for local development).
- Password sign-in issues a session directly; MFA is not mandatory.
- Added `Roles`/`RolesGuard` and `TerritoryScoped`/`TerritoryScopedGuard`. Admins bypass territory filtering; other users must carry the requested territory in their session/user context.
- Added `UsersService` helpers and module exports for role/territory checks.
- Added append-only `AuditService.record(actor, action, entity)`, writing to the existing immutable `AuditEvent` table. Exact-location release events can be represented with the same boundary.
- Added auth controller/module wiring and the API e2e Vitest configuration.

## Verification

Passing:

- `pnpm --filter @betna/api test -- src/auth/auth.service.spec.ts` (5 tests)
- `pnpm --filter @betna/api test:e2e -- auth` (1 test)
- `pnpm --filter @betna/api typecheck`
- Prettier check for all Task 3 files

The full API test command also collects the existing `prisma/seed.test.ts`, which exits at collection when `DATABASE_URL` is not set. This is an environment prerequisite from Task 2, not an auth failure; the Task 3 suite remains green.

