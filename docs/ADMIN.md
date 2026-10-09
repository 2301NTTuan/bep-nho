# Bếp Nhớ editorial administration

Phase 11 provides a deliberately narrow internal workflow for canonical recipes. It is not a general-purpose CMS and does not add community submissions, bulk imports, or automated culinary approval.

## Access and role operations

Every account defaults to `User.role=user`. Admin routes apply the normal session guard and then re-read the active user and role from PostgreSQL for every request; a role embedded in a request body or an old session cannot grant access. Unauthenticated requests receive 401, authenticated non-admin requests receive 403.

Role changes are operational only. The account must already exist and be active, and granting `admin` requires a verified email. Preview is the default:

```bash
pnpm admin:role -- --email=editor@example.com --role=admin
pnpm admin:role -- --email=editor@example.com --role=admin --execute
```

Revoke in the same dry-run-first manner:

```bash
pnpm admin:role -- --email=editor@example.com --role=user
pnpm admin:role -- --email=editor@example.com --role=user --execute
```

The command is idempotent and reports only email, current/requested role, whether a change is needed, and execution mode. It never creates credentials or prints password/session/token/hash data. Revocation takes effect on the next admin API request even for an existing session.

## Draft and publication lifecycle

The admin app runs on port 3002 and uses the existing Bếp Nhớ session cookie. Its pages are `/login`, `/recipes`, `/recipes/new`, `/recipes/[recipeId]`, and `/recipes/[recipeId]/edit?draft=...`.

A new recipe first reserves a unique slug in a `Recipe` with `status=draft` and creates a separate `RecipeDraft` JSON working document. It stays absent from public recipe reads. A draft cloned from a published recipe records the latest immutable `baseRecipeVersionId`. Each PATCH supplies `expectedRevision`; one atomic conditional update increments the revision, while a stale writer receives 409.

Publish obtains the per-recipe PostgreSQL advisory transaction lock, re-reads the draft and recipe, checks the base is still latest, validates the full document, resolves explicit global ingredient identities, canonicalizes and hashes effective content, and creates a new RecipeVersion plus ingredient, step, rule, media, and publisher provenance rows in one transaction. Identical effective content returns `409 NO_EFFECTIVE_CHANGE`. A stale base returns 409. Existing published rows are never updated.

Published slugs are immutable. An unpublished slug may change if uniqueness is preserved. A new ingredient is created only when its lowercase slug is absent and the draft explicitly permits creation; an existing slug is reused without renaming its global record.

Archive sets `Recipe.status=archived` without deleting anything. Public list/detail, new canonical or personalized CookSession creation, and new personalization are blocked. Historical sessions, snapshots, feedback, Taste provenance, canonical versions, and personalized versions remain readable and immutable. Restore requires at least one published version and changes only status; it does not mint a version. Archive/restore, new CookSessions, and new personalization share the recipe advisory lock so their status checks cannot race.

## Media

Admin upload accepts one JPEG, PNG, or WebP file up to 8 MiB. `sharp` decodes the actual bytes, enforces a 40-million-pixel input cap, rotates according to orientation, strips metadata, and writes a normalized WebP. Client MIME and filename never select the generated `recipe-media/<uuid>.webp` key.

`MediaAsset` stores the immutable key, SHA-256, MIME, size, dimensions, state, and nullable creator provenance. Published RecipeVersions reference media explicitly. Replacing an image creates another asset; bytes behind a published key are never overwritten. Deletion returns 409 while an active draft or any published version references the asset.

The public `GET /v1/media/:mediaId` endpoint resolves only an active database ID, reads its server-owned key, and returns the normalized bytes with WebP content type, SHA-256 ETag, and one-year immutable cache headers. Storage failures return a controlled 503. Recipe text/list requests never contact S3, and PostgreSQL/Redis readiness remains independent from object storage.

Required storage configuration is `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, and `S3_FORCE_PATH_STYLE`. For local development or CI, provision the configured bucket explicitly:

```bash
pnpm storage:ensure
```

The helper may create a missing non-production bucket. It refuses bucket creation when `NODE_ENV=production`; production operators must provision storage separately. GitHub Actions starts a disposable digest-pinned MinIO only in integration and E2E jobs.

## Editorial release checklist

1. Confirm the editor account is verified and grant the role with the dry run and `--execute` commands above.
2. Sign in at port 3002, create or clone a draft, and save after reviewing its current revision.
3. Validate metadata, ingredient scaling, ordered steps, optional Taste rules, image preview, and meaningful alt text.
4. Confirm publication. If a 409 reports a stale draft, reload and create a fresh clone; do not overwrite the newer version.
5. Verify the exact new version in admin and public views. Archive only when new use should stop; restore does not create a version.
6. For media 503 errors, diagnose storage as described in the runbook. Do not weaken global readiness or expose the bucket publicly as a workaround.
