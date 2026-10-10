# Bếp Nhớ operations runbook

This runbook covers the current modular-monolith alpha: public and admin Next.js processes, a NestJS API process, PostgreSQL, Redis, and S3-compatible editorial media storage. Object storage is used by media operations but remains outside global readiness so text and cooking flows stay available during a storage outage.

## Required configuration

Keep secrets in the deployment secret store, never in Git or `.env.example`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by the API, Prisma migrations, backups, and maintenance commands. |
| `REDIS_URL` | Redis used by distributed login/register rate limits and included in readiness. |
| `NODE_ENV=production` | Enables production cookies, HSTS, JSON logs, and excludes development-only routes. |
| `PORT` | API listen port; defaults to `3001`. |
| `CORS_ORIGIN` | Comma-separated exact web origins allowed to send credentialed requests. Never use `*`. |
| `NEXT_PUBLIC_API_BASE_URL` | Browser-visible API base, normally `https://api.example/v1`. It is embedded at web build time. |
| `AUTH_RATE_LIMIT_LOGIN_POINTS` | Login attempts per IP/window; safe default `10`. |
| `AUTH_RATE_LIMIT_REGISTER_POINTS` | Registration attempts per IP/window; safe default `5`. |
| `AUTH_RATE_LIMIT_LIFECYCLE_REQUEST_POINTS` | Verification/reset email requests per endpoint and IP/window; safe default `5`. |
| `AUTH_RATE_LIMIT_LIFECYCLE_CONFIRM_POINTS` | Verification/reset confirmation attempts per endpoint and IP/window; safe default `10`. |
| `AUTH_RATE_LIMIT_WINDOW_SECONDS` | Rate-limit window; safe default `60`. |
| `AUTH_RATE_LIMIT_KEY_PREFIX` | Redis key namespace; use a deployment-specific value. |
| `TRUST_PROXY_HOPS` | Number of trusted reverse-proxy hops. Default `0` ignores arbitrary forwarded IPs. |
| `LOG_LEVEL` | Pino level, normally `info`. |
| `OPENAPI_ENABLED` | Expose machine-readable `GET /v1/openapi.json`; defaults enabled. |
| `METRICS_ENABLED` | Expose Prometheus `GET /metrics`; defaults enabled. Restrict it at the network edge. |
| `SESSION_RETENTION_DAYS` | Default retention for the explicit session cleanup command; defaults to `30`. |
| `PUBLIC_WEB_URL` | Public web origin used to construct verification/reset links, for example `https://app.example`. |
| `MAIL_TRANSPORT` | Must be `smtp` in production; startup validation rejects `memory`. Development/test may use `memory` or a valid SMTP configuration. |
| `MAIL_FROM` | Verified sender address for lifecycle email. |
| `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`, `MAIL_SMTP_SECURE` | Provider-neutral SMTP connection settings. |
| `MAIL_SMTP_USERNAME`, `MAIL_SMTP_PASSWORD` | Optional only for an intentional unauthenticated relay; configure both or neither and store them only in the deployment secret store. |
| `DEV_MAIL_OUTBOX_KEY` | Non-production-only key for raw memory-outbox inspection. Use a fake local/test value; never configure or expose the dev route in production. |
| `S3_ENDPOINT`, `S3_REGION` | Endpoint and signing region for the operator-provided S3-compatible service. |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Storage credentials; keep them only in the deployment secret store. |
| `S3_BUCKET` | Private bucket containing immutable normalized recipe media. |
| `S3_FORCE_PATH_STYLE` | `true` for local MinIO and providers requiring path-style addressing; otherwise provider-specific. |

If the API is directly internet-facing, keep `TRUST_PROXY_HOPS=0`. Set it to `1` only when exactly one controlled reverse proxy is in front of the API; adjust it only to match a known topology. A wrong value can let clients influence the IP used for abuse protection.

## Initial startup

1. Provision PostgreSQL, Redis, and the private S3-compatible bucket and verify they accept connections.
2. Install the immutable dependency set with `corepack enable` and `pnpm install --frozen-lockfile` using Node 24 and pnpm 10.34.6.
3. Validate the schema with `pnpm db:validate`.
4. Apply committed migrations with:

   ```bash
   pnpm --filter @bep-nho/database exec prisma migrate deploy --schema prisma/schema.prisma
   ```

5. Build with `pnpm build` and start the API, public web, and admin web processes through the configured process supervisor.
6. Require `GET /v1/health/live` and `GET /v1/health/ready` to return 200 before routing traffic.

The alpha seed is deterministic and refuses to rewrite versioned content, but it is a content-bootstrap tool rather than a production release migration. Run `pnpm --filter @bep-nho/database db:seed` only for a new environment where the 13 reviewed-for-alpha fixtures are intentionally wanted. Never use a seed as an ad-hoc production content editor.

For local development/CI only, `pnpm storage:ensure` checks the configured bucket and creates it if missing. It refuses creation in production. Production provisioning belongs to infrastructure automation, not API startup.

## Admin publishing and media operations

Use the dry-run-first role procedure and editorial lifecycle in `docs/ADMIN.md`. Role changes are effective on the next request because admin authorization always consults PostgreSQL. There is no role-management HTTP endpoint.

Published recipe versions and their child rows are immutable. Publication is forward-only: a content change creates a new version under the shared per-recipe advisory lock. Archive/restore only changes recipe status. Never repair content by updating a published RecipeVersion or media object in place.

Media storage is private. `GET /v1/media/:id` is the controlled delivery path. A media 503 does not imply PostgreSQL/Redis readiness should fail. Diagnose with provider health and a non-production bucket check, without printing credentials:

```bash
pnpm storage:ensure
curl -fsS http://localhost:3001/v1/media/KNOWN_ACTIVE_MEDIA_UUID -o /dev/null
```

Check endpoint/DNS/TLS, region, bucket existence, path-style policy, IAM permissions for get/put/delete, and object presence. Never log signed headers, credentials, or image bytes. A missing active object is an operational inconsistency and currently returns 503; restore the immutable object from the verified storage backup rather than uploading different bytes at the same key.

## Health, logs, metrics, and contract

- `/v1/health/live` proves only that the API process can answer.
- `/v1/health/ready` checks PostgreSQL and Redis and returns 503 if either is unavailable.
- `/v1/health` is the compatibility alias for readiness.
- `/metrics` emits Prometheus process and normalized HTTP/rate-limit metrics. It contains no user, email, session, or recipe-ID labels. Disable it or allow only monitoring infrastructure if the endpoint should not be public.
- `/v1/openapi.json` is the deliberate machine-readable HTTP contract. Disable it with `OPENAPI_ENABLED=false` if deployment policy requires a private artifact; the committed copy is `docs/openapi/openapi.json`.
- Production logs are JSON. Search by `requestId`, then inspect method, normalized route, status, duration, and error. Passwords, cookies, authorization values, private feedback notes, and raw session tokens must never be added to logs.

Useful checks:

```bash
curl -fsS https://api.example/v1/health/live
curl -fsS https://api.example/v1/health/ready
curl -fsS https://api.example/metrics | head
```

## Authentication and Redis

Sessions use an opaque `HttpOnly`, `SameSite=Lax`, `Secure` production cookie; only its hash is stored. Stateful browser requests also require an allowed exact `Origin`. A missing or foreign Origin returning 403 is expected, not a CORS failure to bypass.

Login, registration, verification request/confirmation, and reset request/confirmation have independent Redis-backed, per-IP buckets. Rejection is generic, returns 429 with `Retry-After`, and does not disclose account existence. If Redis cannot be used, these protected endpoints fail closed with 503; ordinary recipe reads remain available. Investigate Redis connectivity rather than disabling the guard.

Verification and password-reset request endpoints always return the same accepted response for known and unknown emails. Raw tokens are 256-bit random values and only SHA-256 hashes are stored. Verification tokens expire after 24 hours; reset tokens expire after one hour. Reissue invalidates an older unused token. A successful reset revokes every session and requires a new login. An authenticated password change keeps the current session but revokes every other session.

Login, registration, and the non-production dev-session path create sessions only inside a transaction holding the same per-user lifecycle advisory lock as password reset, password change, and account deletion. Login re-reads the credential and verifies the password while holding that lock. Do not move password verification or session insertion outside this transaction: doing so can reintroduce an old-password session after credential rotation.

`GET /v1/me/sessions` exposes only timestamps, an opaque database ID, and whether a row is current. It intentionally stores/returns no IP, user-agent, or device fingerprint. `lastUsedAt` writes at most once per five minutes. Foreign session IDs return 404. Use the account page or owner-scoped API to revoke one/all-other sessions; never manipulate token hashes manually.

Account deletion requires the current password plus exact `DELETE`. It transactionally deletes the user and all user-owned auth, Cook, Taste, and personalized data, then clears the cookie. Canonical Recipe/RecipeVersion content remains. Historical immutability applies to ordinary product edits; it does not override an explicit account deletion request.

## Lifecycle email delivery

Production deployments must set `MAIL_TRANSPORT=smtp`, a verified `MAIL_FROM`, `PUBLIC_WEB_URL`, and valid SMTP host/port settings before the API can start. SMTP username/password must be supplied together or both omitted for an intentional unauthenticated relay. Test the sender domain's SPF/DKIM/DMARC policy, delivery, expiry, one-time consumption, and links through the public TLS ingress. A transient delivery error keeps the generic accepted public response and is logged only as a bounded lifecycle failure; never add email addresses, SMTP credentials, raw/hash tokens, cookies, or outbox keys to logs.

`MAIL_TRANSPORT=memory` is solely for development and automated tests. The bounded outbox can be read through `/v1/dev/mail-outbox/latest` only when the non-production DevModule exists and the request sends the configured `DEV_MAIL_OUTBOX_KEY` in `X-Dev-Mail-Outbox-Key`. Missing, unset, or wrong keys return 404. Production excludes that module and route from routing and OpenAPI, and startup validation rejects memory delivery under `NODE_ENV=production`. Never expose or proxy a dev route in a real environment.

Expired/revoked sessions are removed only by explicit maintenance. Preview first:

```bash
pnpm sessions:cleanup -- --retention-days=30
```

After reviewing the count, execute the exact policy:

```bash
pnpm sessions:cleanup -- --retention-days=30 --execute
```

The command deletes only sessions expired before the cutoff or revoked before the cutoff. Schedule it externally (for example daily); do not add an in-process scheduler to every API replica.

## Dependency review

Pull requests run GitHub's dependency review at high severity. Before a release, also run `pnpm audit --prod --audit-level high` and record any exception rather than silently weakening the threshold.

As of 2026-10-09, patched transitive overrides are pinned for Multer, Lodash, js-yaml, and PostCSS. One high advisory remains in `deepmerge-ts@7.1.5`, reached through the deliberately pinned Prisma 6.19.3 configuration tooling. The vulnerable recursive-object merge is not fed request/user data in this application, and forcing the incompatible `deepmerge-ts` 8 major underneath Prisma was rejected. Track the upstream Prisma-compatible fix and treat removal of this exception as a prerequisite for broader public exposure.

## PostgreSQL backup

Use PostgreSQL client tools with the same major version as the server. The scripts refuse a major mismatch by default because newer clients can emit statements unsupported by an older restore target.

```bash
export DATABASE_URL='postgresql://...'
export BACKUP_DIR='/srv/backups/bep-nho'
scripts/ops/backup-postgres.sh
```

The result is a timestamped, mode-restricted custom-format dump. Store it encrypted outside the application host. A reasonable starting policy is daily backups retained for 14 days, weekly copies for 8 weeks, and a restore verification after client/server upgrades and before risky migrations. Adjust retention to legal and business requirements.

## Restore verification

Verification creates a uniquely named disposable database, restores the dump, checks applied migrations and critical tables, prints representative row counts, and drops the database on exit:

```bash
export BACKUP_FILE='/srv/backups/bep-nho/bep-nho-YYYYMMDDTHHMMSSZ.dump'
export VERIFY_ADMIN_DATABASE_URL='postgresql://.../postgres'
scripts/ops/verify-backup.sh
```

For an explicit empty target, use:

```bash
export RESTORE_DATABASE_URL='postgresql://.../bep_nho_restore_target'
scripts/ops/restore-postgres.sh
```

The restore script refuses the current `DATABASE_URL`, a target named `bep_nho`, and a non-empty target unless exact risk acknowledgements are supplied. It never drops a database. Do not use those overrides during routine verification.

## Release checklist

1. Confirm the completed GitHub Actions `static`, `integration`, and `e2e` jobs are green for the exact commit; review dependency review on pull requests.
2. Confirm a recent backup has passed disposable restore verification.
3. Pull an immutable reviewed commit or tag.
4. Install with `pnpm install --frozen-lockfile` on Node 24/pnpm 10.34.6.
5. Run `prisma migrate deploy` as shown above. Never run `prisma migrate reset` in a shared or production environment, and never rewrite applied migration history.
6. Build/start API and web with the release configuration.
7. Wait for readiness 200 before sending traffic.
8. Smoke register/login/logout and verify one designated non-production-data account through the configured SMTP path.
9. Smoke password reset and confirm every old session is revoked; remove the disposable account through the deliberate deletion flow.
10. Smoke public recipe detail plus one recipe/cook path without leaving unwanted data.
11. Monitor 5xx/429 rate, readiness, mail-delivery failures, latency, and structured error logs through the stabilization window.

Before any risky migration, take and verify a backup. Prisma migrations are forward-only in the current operating model.

## Rollback and recovery

Application-only defects can be rolled back to a prior immutable build if its code is compatible with the already-applied schema. Rolling back application files does not roll back PostgreSQL.

For a bad database migration, prefer a reviewed forward-fix migration. If incident impact requires data recovery, stop writes, preserve incident evidence, choose a verified recovery point, and restore into a separate database first. Promote/repoint only through an explicit incident decision. There is no automatic schema rollback and no script that drops the live database.

## Common failure diagnosis

- **Readiness 503, PostgreSQL false:** check connection/DNS/TLS, credentials, connection limits, then migration state. Liveness may remain 200.
- **Readiness 503, Redis false:** check Redis reachability and auth. Login/register will fail closed; recipe reads need not.
- **Browser mutation 403:** compare the browser `Origin` exactly with `CORS_ORIGIN`; do not add a wildcard.
- **Unexpected shared rate limits:** verify proxy topology and `TRUST_PROXY_HOPS`, then inspect the deployment-specific Redis prefix.
- **Lifecycle email not received:** verify `MAIL_TRANSPORT=smtp`, sender/SMTP configuration, paired credentials, `PUBLIC_WEB_URL`, provider delivery logs, and SPF/DKIM/DMARC. Never switch production to the memory outbox.
- **Media upload/read 503:** verify the S3 endpoint, region, path-style setting, private bucket, credentials, permissions, and object presence. Core readiness may remain 200 by design.
- **Admin request 403:** verify the account is active and inspect the dry-run `pnpm admin:role` result. Do not add a public grant endpoint or trust a role sent by the browser.
- **Draft publish 409:** distinguish stale revision/base version from `NO_EFFECTIVE_CHANGE`; reload/create a fresh draft rather than changing immutable published rows.
- **Development outbox returns 404:** confirm the API is non-production, memory delivery is selected, `DEV_MAIL_OUTBOX_KEY` is set to a 16–128 character fake development value, and the same value is sent only in `X-Dev-Mail-Outbox-Key`.
- **401 on protected routes:** verify cookie domain/HTTPS/Secure behavior and session expiry/revocation; never log the cookie.
- **OpenAPI drift:** run `pnpm openapi:generate`, review the semantic change, then commit the regenerated artifact. Do not hand-edit the JSON.
- **Restore/client mismatch:** install matching PostgreSQL client tools and create a fresh verified dump; do not bypass the check casually.
- **Migration failure:** stop the release, preserve logs and database state, and decide between a forward fix and verified recovery. Never run `migrate reset`.
- **Household invite rejected:** verify the household is active, below eight members, the user has no membership, and the token is unused/unexpired. Never inspect or log the raw token or stored hash.
- **Family version blocked:** verify current membership and recipe `published` status. Generation takes the recipe lock before the household lock; do not introduce the reverse order in another transaction.
- **Owner account deletion:** account deletion takes the account lifecycle lock before the household lock, then promotes the deterministic oldest remaining member or closes an empty household. Do not manually delete shared household-version history.
- **Phase 12 CI:** the browser job uses a dedicated Redis rate-limit prefix and high test-only points so the five disposable E2E flows do not consume the production-style registration bucket; integration still exercises the real bounded rate-limit behavior.

## Prohibited shortcuts

- Do not commit real credentials, cookies, tokens, `.env` files, or database dumps.
- Do not expose the development mail outbox, place its key in a query string/log, or enable its raw-token transport in production.
- Do not use wildcard credentialed CORS or blindly trust `X-Forwarded-For`.
- Do not disable Origin protection or rate limiting to make a smoke test pass.
- Do not rewrite applied migrations, run `prisma migrate reset`, or restore over the live database.
- Do not claim a backup is usable until disposable restore verification succeeds.
- Do not publish the alpha as culinary/safety reviewed; the recipe set still needs human editorial review.
