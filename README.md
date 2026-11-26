# Betna

Betna is a trust-first property marketplace for Kenya and Uganda. This repository is a pnpm/Turborepo TypeScript monorepo with a Next.js web app, a NestJS API, and shared contracts, UI, and configuration packages.

## Requirements

- Node.js 22+
- pnpm 9 (Corepack can activate the version declared in `package.json`)
- Docker Engine with Compose v2

## Local setup

1. Copy `.env.example` to `.env` and adjust secrets or ports as needed.
2. Install dependencies:

   ```sh
   pnpm install
   ```

3. Start PostgreSQL/PostGIS, Redis, and MinIO:

   ```sh
   docker compose --env-file .env -f infra/docker-compose.yml up -d
   ```

   MinIO's API is available at http://localhost:9000 and its console at http://localhost:9001. The PostgreSQL service is available on port 5432 and Redis on port 6379 by default.

4. Start the development applications:

   ```sh
   pnpm dev
   ```

   The web app listens on http://localhost:3000 and the API on http://localhost:4000 by default.

## Workspace commands

```sh
pnpm dev       # Run web and API development tasks through Turborepo
pnpm lint      # Lint all workspace packages
pnpm test                 # Unit/smoke tests only (Vitest; no DB or browser suites)
pnpm test:db              # Database integration gate (requires migrated PostgreSQL/PostGIS)
pnpm test:e2e             # API e2e plus web Playwright through Turborepo
pnpm test:playwright      # Web Playwright gate only (starts its configured test servers)
pnpm build                # Production API/web/package builds
pnpm typecheck            # Type-check all packages
```

The release gates are intentionally separate: run `pnpm test` for fast unit
coverage, `pnpm test:db` against an isolated migrated database, and
`pnpm test:playwright` (or the combined `pnpm test:e2e`) for browser/API flows.
The root Vitest configuration excludes `apps/api/test`, `apps/api/prisma`, and
web `e2e` suites so database fixtures and Playwright never run as unit tests.

## Environment variables

Every variable used by the local runtime is documented in `.env.example`: application ports and URLs, locale settings, session/JWT secrets, PostgreSQL/PostGIS connection details, Redis/BullMQ connection details, S3-compatible storage and MinIO credentials/buckets, and optional email/WhatsApp/SMS/maps provider settings. Keep `.env` local and never commit credentials.
