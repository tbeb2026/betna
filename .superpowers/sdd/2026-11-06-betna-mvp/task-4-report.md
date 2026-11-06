# Task 4 report — localized web shell and role portals

## Delivered

- Added `next-intl` routing for English (`en`) and Tigrinya (`ti`) with an explicit LTR document direction for both locales.
- Added App Router locale layout, generated locale params, localized messages, accessible primary navigation, public landing page, and localized not-found page.
- Added owner, verifier, and admin protected layouts/pages. Server-side `requireRole(role, locale)` reads the opaque `betna_session` cookie, validates it through the configured API session endpoint, and redirects missing or insufficient sessions to sign-in or their permitted portal.
- Added a typed API client with bearer-token support and normalized API errors.
- Added the authenticated Task 3 `GET /auth/session` projection used by the server guard; it returns role/territory context without exposing the bearer token.
- Added Next/next-intl, Vitest, TypeScript, and Playwright configuration for the previously empty web package.
- Added a browser test proving an owner visiting `/ti/admin` is redirected to `/ti/owner`, and both locale and document direction remain correct.

## Test-first evidence

The routing test was written before `routing.ts` and initially failed because the module was absent. The portal test was written before the App Router shell and initially failed because no Playwright web configuration existed. Both later passed after the minimal implementation.

## Verification

- `pnpm --filter @betna/web test` — PASS (1 file, 3 tests)
- `pnpm --filter @betna/web test:e2e -- portal-access` — PASS (1 test)
- `pnpm --filter @betna/web typecheck` — PASS
- `CI=1 NEXT_TELEMETRY_DISABLED=1 pnpm --filter @betna/web build` — PASS
- `pnpm --filter @betna/api test:e2e -- auth` — PASS (3 tests)
- `pnpm --filter @betna/api typecheck` — PASS

The browser run required the locally approved Playwright Chromium/headless-shell download and elevated socket permission for the local Next.js test server.

## Decisions / scope notes

- The API client targets `API_INTERNAL_URL` on the server and falls back to `NEXT_PUBLIC_API_URL`; the role guard uses the authenticated `GET /auth/session` projection while preserving the Task 3 opaque bearer-token boundary.
- A `BETNA_TEST_AUTH=1`-gated `test.` cookie decoder exists only for the isolated Playwright route test; unsigned test sessions are not accepted in normal runtime.
- The existing standalone HTML remains untouched and is not imported or executed by the new shell.
