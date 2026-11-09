# Betna security controls

## Release gates

- Pull requests require the CI quality job: lint, TypeScript, unit tests, API and browser end-to-end tests, dependency audit, and whitespace checks.
- Container builds and `docker compose -f infra/docker-compose.yml config` run after quality passes.
- The workflow has read-only repository permissions and cancels superseded runs. Never put production credentials in workflow YAML or test fixtures.
- Review dependency-audit findings before release; high and critical findings block the pipeline.

## Secrets and configuration

Production startup rejects missing, placeholder, or short values for `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `JWT_SECRET`, `MEDIA_SIGNING_SECRET`, `API_CORS_ORIGINS`, and `PUBLIC_API_URL`. `PUBLIC_API_URL` must be the explicit HTTPS API origin used in visitor location-redemption links; production never falls back to localhost. Inject them through the deployment secret manager, not an image layer, `.env` file, or command-line argument. Rotate session/signing secrets with a planned session invalidation window.

`API_CORS_ORIGINS` must be an explicit allow-list of HTTPS browser origins. Do not use `*` with credentials. Keep `API_INTERNAL_URL` private to the web runtime; only `NEXT_PUBLIC_API_URL` is browser-visible.

`NEXT_PUBLIC_API_URL` is embedded into the browser bundle at web image build time. Production web builds must pass the public HTTPS API origin as the `NEXT_PUBLIC_API_URL` Docker build argument; setting it only when the container starts cannot repair an already-built client bundle.

## Data and access

- PostgreSQL is the system of record. Database users receive least privilege; migration credentials are separate from the runtime user.
- Exact property addresses and inspection evidence are private. Public responses contain only approved approximate location data and signed, time-bound media URLs.
- Session bearer tokens are accepted only over TLS in production. Role and territory guards remain server-side; hiding a portal control is not authorization.
- Guest inquiry input is validated, rate limited, and audited. Never log inquiry messages, tokens, addresses, payment evidence, or raw request bodies.
- Every location release, verification, conversion, and commission transition is attributable to a staff identity.

## Incident response

If a secret, token, or private location is exposed: disable/rotate the credential, revoke affected sessions and signed URLs, preserve audit/log evidence, notify the security owner, and document scope and timing. For suspected unauthorized access, preserve the database and object-storage audit trail before cleanup.

## Safe observability

API logs are JSON with timestamp, level, service, request path, and status. The global exception filter returns a generic 500 message and keeps stack traces in server logs only. Scrub log sinks and alert payloads for email, phone, addresses, credentials, and payment evidence.
