# Deployment and rollback runbook

## Pre-flight

- Link the release commit to a green CI run and an immutable image digest.
- Confirm migration compatibility, secret-manager values, backup age, and an on-call owner.
- Review the diff for auth, location-release, media, conversion, and commission changes.

## Deploy

1. Publish API and web images tagged with the full commit SHA.
2. Build the web image with `--build-arg NEXT_PUBLIC_API_URL=https://api.example.com` and deploy it with `API_INTERNAL_URL=http://api:4000` (or the private service DNS name) and `PUBLIC_API_URL=https://api.example.com`. `NEXT_PUBLIC_API_URL` is a build-time browser setting; `API_INTERNAL_URL` is a runtime-only server setting; `PUBLIC_API_URL` is the explicit HTTPS origin used in visitor location-redemption links. Apply all other environment variables without printing them; production startup validation must pass.
3. Run `pnpm --filter @betna/api prisma migrate deploy` from the controlled migration job.
4. Deploy the API with at least one old replica serving until the new replica is ready. Wait for `/health/ready` before shifting traffic.
5. Deploy the web image and verify `/api/health`.
6. Perform smoke checks: public search, account-free inquiry, admin location release, owner confirmation, staff-verified payment evidence, and commission due. Confirm no private address appears in public search responses.
7. Monitor HTTP 5xx, latency, readiness, database connections, queue age, and error logs for 15 minutes. Record the operator and evidence in the release ticket.

## Rollback

For application-only failures, stop the rollout and route traffic back to the previous image digest. Keep successful forward migrations in place. If a migration is incompatible, stop writes, page the incident commander, and use the backup/restore runbook; never edit migration history or run an unreviewed destructive SQL command.

After rollback, verify both health probes and the critical smoke path, preserve logs, and document the trigger, time, image digests, migration state, and follow-up fix. Resume rollout only after CI and a fresh staging rehearsal are green.
