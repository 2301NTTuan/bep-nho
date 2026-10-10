# Bếp Nhớ MVP review

Date: 2026-10-11

## Current MVP readiness

The core differentiating loop is implemented and integration-tested:

1. discover and read a published canonical recipe;
2. cook the canonical or an exact personalized version;
3. submit feedback, excluding technically invalid cooks from learning;
4. update an explainable Taste DNA profile;
5. deterministically create or reuse a bounded personalized version;
6. keep every historical cook session bound to the version actually cooked.

The web experience now presents this loop coherently on desktop and mobile, and a real Chromium flow exercises the product loop against PostgreSQL and Redis. The repository has the engineering baseline for a serious internal or carefully controlled public alpha, but it is not ready for unrestricted public production traffic.

## Remaining product gaps

- First-party email/password sign-in, verification, recovery, password change, revocable session management, deliberate full account deletion, `/v1/me`, and object-level ownership checks are implemented. MFA, social login, and account email change remain later security work.
- The internal alpha now has 13 structured Vietnamese home recipes, but they remain explicitly experimental and still need human culinary/editorial review plus production media/workflow.
- Serving selection supports deterministic ingredient-aware scaling for 1–8 portions, with conservative/fixed modes and practical rounding. Broader culinary calibration still needs editorial testing.
- Cook Mode now resumes from an immutable server snapshot, persists real timer/progress events, and queues progress briefly offline. The happy path has browser E2E coverage; timer pause, multi-device conflict UX, multi-tab sequencing, and offline feedback/completion remain open.
- Users can now explicitly accept, reject, or bounded-edit adjusted ingredients, and can pin one immutable “My Best Version” per recipe. Broader version-library comparison and bulk review remain future UX work.
- Taste DNA now has a private history/control screen with deterministic explanations, manual overrides, and per-dimension reset. Cross-device live refresh and export are not included.
- The web now has login/register/logout, account settings, verification, forgot/reset password, session revocation, and destructive deletion confirmation while keeping public recipe browsing available signed out. Cookie/Origin behavior and Redis-backed auth lifecycle abuse controls are verified; a real SMTP sender, production ingress, secret store, TLS/cookie domain, monitoring, and deployment remain environment work.
- Households now have a durable Monday-based weekly planner, current-member manual CRUD, deterministic lunch/dinner suggestions, exact Family Taste cooking versions, atomic stale-safe apply, and responsive planner, pantry, and shopping-list experiences. Pantry quantities remain explicit manual state; shopping requirements use exact recipe provenance and exact-unit subtraction without conversion. Purchased-state workflows, automatic stock consumption, nutrition scoring, substitution, recurring plans, and realtime collaboration remain later product work.

## Architectural debt and operational gaps

- API contracts retain shared TypeScript definitions and now also publish a deterministic OpenAPI 3 artifact/route with CI drift detection. Client generation is intentionally deferred.
- Scaling, cook progress, timer restoration, sequencing, queue reconciliation, Taste replay, and effective override semantics now have pure domain utilities. HTTP orchestration and deterministic explanation copy remain in NestJS services.
- User-owned APIs now have session guards, 404 ownership semantics, Origin checks, focused security tests, and independent Redis-backed login/register/verification/reset request and confirmation limits. Retry idempotency beyond the hardened cooking and token-consumption paths and broader audit controls remain open.
- The integration suite covers concurrency, provenance, the domain loop, recovery races, session ownership, and deletion cascades; focused HTTP tests cover the production bootstrap/security surface. Playwright plus axe covers the core desktop flow and account lifecycle pages; responsive/mobile and broader WCAG/manual review remain open.
- GitHub Actions now defines static, integration, E2E, and pull-request dependency-review jobs. Structured JSON logs, bounded request IDs, normalized Prometheus HTTP metrics, and PostgreSQL/Redis readiness form a modest baseline; tracing and an external error/metrics/log backend remain deployment work. The production audit's remaining high advisory is confined to Prisma 6.19.3 configuration tooling and is explicitly tracked rather than hidden by an unsafe transitive-major override.
- Backup/restore/session-maintenance scripts and a deployment runbook now exist, with a successful local restore into a disposable PostgreSQL database. Off-host scheduling, encryption, retention enforcement, alerting, and disaster-recovery exercises remain operator responsibilities.
- Admin is only a skeleton; content publication currently depends on database seeds.

## Recommended next phases

### Phase 6 — Auth and ownership boundary

Completed 2026-10-08: first-party scrypt credentials, hashed opaque sessions, `/v1/me`, secure httpOnly cookies, exact-Origin CSRF protection, object ownership guards, removal of caller-selected user IDs, web auth UI, and two-user authorization tests.

### Phase 7 — Alpha content and cooking reliability

Completed 2026-10-08: 13 explicitly experimental Vietnamese home recipes, immutable/version-safe seed content, ingredient-aware 1–8 serving scaling, exact CookSession snapshots, owner-scoped resume, timestamp timers, robust event sequencing, and a user-scoped IndexedDB progress queue. Human culinary review remains outstanding; no verification claim is made.

### Phase 8 — User control over learning

Completed 2026-10-08: private Taste DNA history/explanations, append-only manual override/reset controls, deterministic post-reset replay, bounded adjustment accept/reject/edit decisions, explicit engine/user version provenance, and stable “My Best Version” pinning.

### Phase 9 — Delivery quality and operations

Completed 2026-10-09: deterministic OpenAPI generation/drift checks, production-mode HTTP tests, Playwright/axe core-loop coverage, reproducible GitHub Actions jobs, Redis-backed auth throttling, Helmet/proxy/request-ID hardening, JSON logs/Prometheus metrics, liveness/readiness, verified custom-format backup/restore scripts, safe session cleanup, and `docs/RUNBOOK.md`. Final Phase 9 run #19 was green on its exact HEAD.

### Phase 10 — Account lifecycle and controlled-alpha readiness

Completed 2026-10-09: hash-only expiring email-verification/password-reset tokens, enumeration-safe public requests, SMTP abstraction plus a keyed test/dev-only memory outbox, reset-all/change-other session policies, owner-scoped session management, transactional password-confirmed account deletion, account/recovery UI, OpenAPI, PostgreSQL integration coverage, and focused Playwright/axe flows. Phase 10.1 additionally serializes login, registration, and dev-session creation against reset/change/delete; rejects unusable production SMTP configuration at startup; and requires a constant-time-compared outbox header. Implementation run #22 was green on exact SHA `595a4f313293d4d0316ee85fa96d03b494b5fe2e`. A real SMTP provider and production infrastructure remain deployment prerequisites.

Phases 11–14 are complete through controlled editorial publishing, Household/Family Taste, weekly meal planning, manually maintained pantry inventory, and deterministic immutable shopping-list snapshots. Do not begin Phase 15, purchased-state workflows, stock consumption, unit conversion, social, or monetization work automatically.

## Phase 5.5 hardening completed

- Taste profiles are unique per user and algorithm version, with concurrency-safe creation.
- Feedback, session completion, and personalized version generation are safe under concurrent retries.
- Taste signals retain durable CookFeedback provenance; technical exclusions preserve all reason codes without changing learned state.
- Personalized content hashes represent effective cooking output rather than volatile Taste DNA evidence.
- Feedback UI learns only dimensions the user explicitly selected, including explicit neutral (`0`).
- Development-only bootstrap has controller-level production denial in addition to conditional module registration.

## Phase 6 authentication completed

- Authentication uses normalized email plus versioned scrypt hashes; raw passwords and raw session tokens are not persisted.
- Opaque cookie sessions enforce expiry, revocation, and active-user status; production cookies are HttpOnly, SameSite=Lax, Path=/, and Secure.
- All cook, feedback, Taste DNA, and personalization ownership is derived from the authenticated session. Foreign resources return 404, and legacy user-ID routes are gone.
- Stateful browser requests enforce configured origins, while credentialed CORS never emits a wildcard origin.
- Remaining production blockers are MFA/account-email-change policy, real SMTP and production infrastructure/secret/TLS/monitoring configuration, human culinary/editorial review, multi-tab/event conflict UX, and broader accessibility/security/operational review. Phase 8 supplied user control; Phase 9 supplied baseline abuse protection and delivery operations; Phase 10 supplied ordinary first-party account recovery and deletion.

## Phase 7 cooking reliability completed

- Alpha recipes are maintained as validated manifests, and seeding refuses to rewrite an existing canonical version with different content.
- Scaling is deterministic and shared across API/web: serving scaling precedes Taste factor application and a single practical rounding operation.
- Every new CookSession stores the exact scaled recipe snapshot atomically. Legacy null snapshots have a non-mutating exact-version compatibility path.
- Multiple active sessions are intentionally allowed; `/v1/me/cook-sessions/active` resumes only the latest session owned by the authenticated user.
- Timer and step progress derive from persisted/queued timestamped events. Sequence numbers use the maximum of server and local state.
- IndexedDB retains failed progress events, acknowledges idempotent duplicates, prevents cross-user replay, contains no credentials, and is cleared for the logging-out user.
- Feedback begins only after server-confirmed completion. Phase 5.5 integrity and Phase 6 auth/Origin/404 ownership behavior remain covered.

## Phase 8 user control completed

- `/taste` exposes every supported dimension with learned score, confidence, effective weight/sample count, manual override, effective values, deterministic explanation, and owner-only signal/control history.
- Override `0` is distinct from no override. Any manual override is authoritative at confidence 1 while recipe-rule min/max bounds remain enforced. Clearing and resetting are append-only control events.
- Reset affects only one learned dimension, preserves raw TasteSignal/CookFeedback history and profile/global counters, and uses the same TasteProfile advisory lock as feedback. Subsequent state is replayed only from valid signals after the latest reset.
- Personalized suggestions now use `personalize-v3`, because zero-confidence override semantics materially change effective output. Prior immutable versions remain valid and retain their stored algorithm version.
- ACCEPT records a decision without minting content; REJECT and bounded EDIT create or reuse immutable effective-content snapshots. Source versions never change, and user-derived versions retain canonical/taste provenance plus explicit parent/origin metadata.
- Latest engine suggestion, latest version of any origin, and “My Best Version” are separate concepts. Pin/unpin never creates a version, a later suggestion never moves the pin, and CookSession stores the exact selected version snapshot.
- Current-user guards, exact-Origin mutation protection, foreign-object 404 behavior, append-only decision/control logs, concurrency locks, and effective-content hash reuse are covered by PostgreSQL and HTTP regressions.

## Phase 9 delivery quality and operations completed

- `.github/workflows/ci.yml` runs frozen-install static/OpenAPI/build checks, PostgreSQL+Redis integration tests, seeded production-build Playwright/axe E2E, and high-severity dependency review for pull requests. Failure artifacts contain screenshots/reports, not traces, video, dumps, or auth material.
- `GET /v1/openapi.json` and `docs/openapi/openapi.json` expose the documented cookie-auth HTTP surface without restoring removed user-ID routes. `pnpm openapi:check` detects drift.
- Login and registration use separate configurable Redis counters keyed by normalized endpoint and Express-resolved client IP. Direct deployment trusts no forwarded IP; proxy trust is explicit. Limits return generic 429 responses with `Retry-After` and fail closed if Redis is unavailable.
- Helmet headers, production HSTS, exact credentialed CORS/Origin behavior, bounded request IDs, JSON Pino request/error logs, and low-cardinality Prometheus metrics establish the API security/observability baseline without logging credentials or private feedback.
- Liveness is dependency-free. Readiness and the legacy health alias require PostgreSQL and Redis, but not currently unused MinIO, and return 503 when degraded.
- `scripts/ops/` creates custom-format dumps, blocks unsafe restores and PostgreSQL client/server major mismatches, verifies restores in a disposable database, and performs dry-run-first expired/revoked session cleanup. `docs/RUNBOOK.md` documents release, diagnostics, forward-only migrations, rollback versus recovery, and prohibited shortcuts.
- Remaining limitations are MFA/social login/account email change, human culinary review and content publication workflow, real hosting/SMTP/monitoring/backup scheduling, remediation of the tracked Prisma-tooling dependency advisory, broader responsive/accessibility/security review, multi-tab conflict coordination, and the product gaps listed above.

## Phase 10 account lifecycle completed

- Registration creates an unverified credential and session without blocking the private cooking/Taste loop. `/v1/me` exposes email verification state and the UI offers a non-blocking resend path.
- Verification and reset use random 256-bit bearer tokens with only SHA-256 hashes persisted. Reissue, expiry, one-time conditional consumption, account lifecycle locks, generic request responses, and independent Redis buckets are covered.
- SMTP is the production-capable provider-neutral transport. Production startup rejects memory delivery, missing SMTP host/sender, or unpaired SMTP credentials. The bounded raw-token outbox exists only in test/development, requires the configured header key, is absent from production routing/OpenAPI, and cannot run under `NODE_ENV=production`.
- Password reset revokes every session and requires login. Authenticated password change preserves only the current session. Session APIs expose timestamps/current state without tokens, hashes, IPs, user agents, or fingerprints.
- Explicit account deletion requires password plus `DELETE`, runs transactionally, and removes all user-owned auth/Cook/Taste/personalization data while preserving canonical content and other users.
- `/account`, `/forgot-password`, `/reset-password`, and `/verify-email` are covered by focused Chromium and axe checks. Remaining blockers are production SMTP/infrastructure, MFA, human content review, and the operational/security exercises listed above.

## Phase 10.1 lifecycle safety completed

- All `AuthSession` creation is inside a PostgreSQL transaction holding the same per-user advisory lock as password reset, password change, and account deletion. Login re-reads and verifies the credential only after acquiring that lock.
- Controlled barrier tests prove reset/change revoke any racing old-password session, deletion prevents a post-delete session, and current/new-password sessions retain the documented behavior.
- Production mail misconfiguration fails during environment validation while transient delivery failures keep the generic enumeration-safe response and bounded log warning.
- Development raw-token retrieval requires `X-Dev-Mail-Outbox-Key`; missing/wrong keys return 404, correct test-only keys work, and production has no route.
- No migration was added: 9 migrations and Prisma 6.19.3 remain fixed. Local gates passed with API 13 suites/68 tests and Playwright/axe 3/3; remote run #22 passed `static`, `integration`, and `e2e` on the exact implementation SHA.

## Phase 11 controlled editorial workflow completed

- Canonical recipe authoring now has an authoritative database role boundary, dry-run-first operational grant/revoke command, separate optimistic JSON drafts, and a usable admin application on port 3002.
- Publication is a single per-recipe locked transaction that validates effective content and creates a new immutable RecipeVersion with ordered ingredients, steps, optional Taste rules, media, and nullable publisher provenance. Stale drafts and identical content return 409; the existing 13 seeded recipes are not rewritten.
- Archive/restore preserves every historical canonical/personalized version, CookSession snapshot, feedback, and Taste signal. Public reads and all new cooking/personalization entry points honor current status under the same advisory lock.
- Recipe images use private S3-compatible storage. Actual JPEG/PNG/WebP bytes are decoded and normalized to metadata-stripped WebP with generated immutable keys. The API serves active assets with immutable caching and isolates storage failures from core readiness.
- The public web renders versioned hero images with meaningful alt text and retains its existing clean fallback. Admin pages cover login, listing, creation, full ingredient/step/Taste-rule editing, media upload/preview, validation, publish confirmation, and archive/restore.
- Migration `20261010100000_admin_recipe_publishing_media` is the additive migration #10. Prisma remains exactly 6.19.3. CI provisions disposable MinIO only for integration/E2E; browser coverage exercises the complete V1/V2/media/archive/restore flow and axe serious/critical checks.
- Final verification passed schema generation/validation, clean 10-migration deploy, twice-idempotent 13-recipe seed, typecheck 6/6, tests 8/8 with API 75/75, build 6/6, OpenAPI drift, and Playwright/axe 4/4. GitHub Actions run #25 (`38002585501`) passed `static`, `integration`, and `e2e` on implementation SHA `8c61e0e32884b2aa822a4ef3da5fe8db1ddf6926`.
- Still out of scope: Family Taste/households, pantry, shopping, meal planning, social/community publishing, monetization, MFA/social login, bulk imports, automated culinary approval, and a general file manager or CDN transformation platform.
## Phase 12 household and Family Taste

The controlled alpha now supports one household per user, up to eight active members, owner/member permissions, manually shared one-time invitation links, an aggregate-only Family Taste view, immutable household recipe suggestions, and exact household-version CookSessions. Personal feedback remains owned by the cook and updates only personal Taste DNA. Multiple households, invitation email, role-transfer UI, household overrides/weights, allergy or medical safety, and Family Best Version remain out of scope.

The additive migration count is 11 and Prisma remains 6.19.3. Local verification passed a clean 11-migration deploy, twice-idempotent 13-recipe seed, typecheck 6/6, API 85/85, build 6/6, deterministic OpenAPI, and Playwright/axe 5/5. GitHub Actions run #28 passed `static`, `integration`, and `e2e` after the E2E-only rate-limit namespace fix; the final documentation follow-up is monitored separately.

## Phase 13 household meal planning

Phase 13 adds one Monday `DATE` plan per household/week, constrained dated entries, current-membership authorization, explicit canonical/household-version provenance, archive-safe history, and account-deletion-safe creator provenance. Manual planning supports Sáng, Trưa, Tối, and Khác with one breakfast/lunch/dinner entry per day and ordered multiple `other` entries.

`family-meal-plan-v1` fills only requested empty lunch/dinner slots. Selection is deterministic and lexicographically prioritizes unused recipes, lower occurrence count in the previous four plan weeks, non-adjacent repetition, then a stable SHA-256 tie-break. Taste does not rank dish preference; current aggregate Family Taste is applied only through unchanged `family-personalize-v1` after dish selection. Preview is plan-read-only, while hash-guarded apply recomputes under sorted recipe locks then the household lock and inserts all entries or none.

The `/household/meal-plan` web route provides responsive seven-day navigation, authoritative manual CRUD, explicit suggestion selection/review, and stale-preview recovery without overwrite. `/household/pantry` adds revision-guarded manual inventory, and `/household/shopping-list` previews and saves deterministic missing-only snapshots for one selected plan week. Migrations #13 and #14 add the pantry and immutable shopping models; Prisma remains 6.19.3. See `docs/MEAL_PLANNING.md` and `docs/SHOPPING_LIST.md` for the exact contracts and invariants.

Final local verification passed a clean 12-migration disposable deploy, twice-idempotent 13-recipe/27-rule seed, typecheck and build 6/6, Turbo tests 8/8 with API 105/105, deterministic OpenAPI, and Playwright/axe 6/6. The exact final remote run is reported with the release result rather than generating another documentation-only CI cycle.
