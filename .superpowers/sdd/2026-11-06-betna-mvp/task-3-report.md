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

## Round 1 hardening

- Replaced untyped Prisma constructor dependencies with `PrismaService` injection and explicit module factories; added `AppModule`, `main.ts`, and a real Nest application bootstrap test.
- Added durable `AuthSession`, `OtpChallenge`, and `UserTerritory` Prisma models/migration. The running Nest module uses Prisma-backed sessions and OTP challenges; process-local maps remain only as a constructor-level fallback for isolated unit tests.
- Added persisted territory assignment loading to sign-in/session context and a `UsersService.assignTerritory()` write boundary.
- Protected `POST /auth/session/revoke` with `AuthSessionGuard`; it reads the bearer session and revokes that current session ID, ignoring arbitrary body tokens.
- Added OTP provider/expiry/max-attempt tests, session expiry, territory allow/deny/admin-bypass tests, persisted territory context coverage, and authenticated revoke coverage.

Additional verification: `pnpm --filter @betna/api build`, `pnpm --filter @betna/api typecheck`, `DATABASE_URL=postgresql://user:pass@localhost:5432/betna pnpm --filter @betna/api prisma validate`, 10 auth unit tests, and 2 auth e2e tests pass.
