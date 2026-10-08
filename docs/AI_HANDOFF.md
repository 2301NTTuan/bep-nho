# AI development handoff

## 2026-10-07 — Phase 0: Repository hygiene

- Commit: `bd1284a` (`chore: ignore TypeScript build cache`)
- Changed: removed the tracked Next.js TypeScript incremental cache and ignored all `*.tsbuildinfo` files.
- Important files: `.gitignore`, `apps/web/tsconfig.tsbuildinfo` (removed).
- DB migrations: none.
- APIs: none.
- Gates: verified the working tree is clean, `.env` is ignored/untracked, and local PostgreSQL, Redis, and MinIO services are healthy.
- Decision: generated caches, build output, runtime logs, and local secrets remain outside Git. Debug logs belong in `/mnt/d/bep_nho_outputs/codex/`.
- Known issues: development UI still calls `/v1/dev/bootstrap` directly; no automated product-loop tests yet.
- Next: polish the complete web flow and responsive Cook Mode without changing backend behavior.

## 2026-10-07 — Phase 1: Web UX/UI polish

- Commit: `1957d18` (`feat(web): polish personalized cooking experience`).
- Changed: rebuilt discovery, recipe detail, personalized-diff, Cook Mode, touch-first feedback, and learning-result experiences with a warm Vietnamese visual system and mobile layouts; added actionable loading, empty, and error states.
- Important files: `apps/web/app/page.tsx`, `apps/web/app/recipes/[slug]/page.tsx`, `apps/web/app/globals.css`, `apps/web/lib/api.ts`, `apps/web/app/layout.tsx`.
- DB migrations: none.
- APIs: no contract or endpoint changes.
- Gates: `pnpm --filter @bep-nho/web typecheck`; `pnpm --filter @bep-nho/web build`.
- Decisions: visual assets remain CSS-native for a fast, dependency-free MVP; feedback uses large discrete controls instead of precision sliders; technical cooking failures are captured separately so they do not masquerade as taste preference.
- Known issues: the UI still gets its user through the development bootstrap response; real auth is intentionally out of scope.
- Next: introduce a frontend/backend CurrentUser boundary and guarantee the bootstrap route cannot be exposed in production.

## 2026-10-07 — Phase 2: Development identity cleanup

- Commit: `21d74b3` (`refactor(identity): isolate development current user`).
- Changed: added a frontend `CurrentUserProvider`, moved user/taste lookup into an API identity service, and made the development module conditional at module registration time.
- Important files: `apps/web/lib/current-user.ts`, `apps/api/src/identity/*`, `apps/api/src/app.module.ts`, `apps/api/src/dev/*`.
- DB migrations: none.
- APIs: `/v1/dev/bootstrap` remains available in development only; it is not registered in production.
- Gates: web/API typecheck, API build, production smoke test (`/v1/health/live` 200 and `/v1/dev/bootstrap` 404).
- Decisions: product pages depend on a replaceable current-user provider; development identity resolution lives behind the same domain-facing service shape intended for future authenticated subjects.
- Known issues: production authentication is intentionally unimplemented, so the production web provider returns a clear configuration error.
- Next: consolidate shared contracts, standardize errors, and tighten request validation without changing product behavior.

## 2026-10-07 — Phase 3: API and contract cleanup

- Commit: `62ece05` (`refactor(api): unify contracts and error envelopes`).
- Changed: made `@bep-nho/contracts` the shared web/API type source, added correlation IDs to successful envelopes, standardized all HTTP errors, and tightened slug, cook-event, and technical-flag validation.
- Important files: `packages/contracts/src/index.ts`, `apps/api/src/http/*`, DTOs under `apps/api/src`, `apps/web/lib/types.ts`, `apps/web/lib/api.ts`.
- DB migrations: none.
- APIs: error shape is now `{ error: { code, message, requestId, details? } }`; successful data envelopes include `meta.requestId`; `X-Request-ID` is returned as a response header.
- Gates: contracts/web/API typecheck, API build, smoke checks for validation envelope and caller-provided request-ID propagation.
- Decisions: JSON-facing contracts use ISO timestamp strings; runtime contract constants constrain event and technical-flag vocabularies at the API boundary.
- Known issues: contracts are TypeScript types/constants rather than generated OpenAPI; authorization still needs real auth before production.
- Next: add database-backed integration coverage for the complete canonical and personalized learning loops.

## 2026-10-07 — Phase 4: Critical-loop test foundation

- Commit: `6b8c39d` (`test(api): cover personalized cooking loop`).
- Changed: added an isolated PostgreSQL integration suite for recipe reads, canonical/personalized sessions, event idempotency, feedback state rules, Taste DNA updates, deterministic reuse/versioning, and historical version binding. Technical-failure feedback now records excluded zero-quality signals without changing learned taste.
- Important files: `apps/api/src/product-loop.integration.spec.ts`, `apps/api/src/feedback/feedback.service.ts`, `apps/api/package.json`.
- DB migrations: none.
- APIs: no route changes; feedback containing a supported technical flag is accepted/audited but excluded from Taste DNA.
- Gates: API test (1 end-to-end integration scenario, pass), API typecheck, fixture cleanup verification (zero test users/recipes left behind).
- Decisions: tests use uniquely named fixtures in the existing development database and remove only their own records; the database is never reset.
- Known issues: no browser automation, accessibility audit, or HTTP-level authorization tests yet; the suite currently prioritizes the high-value domain loop.
- Next: run repository-wide gates, review MVP gaps/debt, and document the next delivery phases.

## 2026-10-07 — Phase 5: Product review

- Commit: `90895ab` (`docs: review MVP readiness and roadmap`).
- Changed: assessed alpha readiness, product gaps, architecture/operations debt, and defined the next four delivery phases; refreshed the outdated repository README.
- Important files: `docs/MVP_REVIEW.md`, `README.md`.
- DB migrations: none.
- APIs: none.
- Gates: documentation diff/format check; final repository-wide gates are recorded below after completion.
- Decisions: prioritize auth/ownership, reliable cooking, user control of learning, and production operations before any social, pantry, household, or monetization domains.
- Known issues: see `docs/MVP_REVIEW.md`; the largest blocker to public production is real authentication and object-level authorization.
- Recommended next step: Phase 6 — implement `/v1/me`, secure sessions, ownership guards, and authorization tests.

## Final verification

- Gate-fix commit: `a33eb7d` (`chore: make repository gates reproducible`).
- `pnpm db:validate`: pass, Prisma CLI/schema version 6.19.3.
- `pnpm typecheck`: pass, 6/6 workspace tasks.
- `pnpm test`: pass, 7/7 tasks; critical database integration suite passed and cleaned up its fixtures.
- `pnpm build`: pass, 6/6 workspace tasks including web, API, and admin production builds.
- Runtime smoke checks: production API health 200; production `/v1/dev/bootstrap` 404; development validation errors and request-ID propagation verified.
- Final gate log: `/mnt/d/bep_nho_outputs/codex/final-gates-2026-10-07.log` (outside Git).

## 2026-10-07 — Phase 5.5: Core hardening

- Commits: `ecea024` data integrity; `18c7598` cooking/API concurrency; `9a979c2` personalization generation; `5c66203` explicit feedback UX; `bde7187` concurrency/provenance tests.
- Migration: `20261007170000_core_hardening` adds unique `(user_id, algorithm_version)` TasteProfile identity and nullable `TasteSignal.cook_feedback_id` with an audit-preserving `ON DELETE RESTRICT` FK. The pre-migration duplicate audit returned zero rows; no data was deleted or merged.
- Fixed: concurrent profile creation, duplicate feedback P2002 leakage/double-learning risk, personalized version races, duplicate completion increments, implicit neutral taste answers, incomplete technical-failure reasons, missing signal provenance, evidence-sensitive content hashes, unsupported “verified” copy, inconsistent serving overrides, and production bootstrap defense-in-depth.
- Decisions: advisory transaction locks are narrowly scoped to a taste-profile identity or user-recipe version stream; excluded reasons use a sorted JSON string in the existing 120-character field (all currently allowed flags fit, avoiding another schema column); effective content hash includes algorithm version, servings/times/summary, ordered ingredients, and ordered steps but excludes evidence metadata; serving scaling remains Phase 7.
- Tests: 6 PostgreSQL integration scenarios plus 3 focused HTTP scenarios cover all concurrency, explicit/omitted feedback, exclusion, provenance, version reuse/change, historical binding, standardized conflict, and dev/prod bootstrap requirements. Fixtures are uniquely named and self-cleaning.
- Final gates: migration status current (5 migrations); `pnpm db:validate` pass on Prisma 6.19.3; `pnpm typecheck` 6/6; `pnpm test` 7/7 workspace tasks with API 2 suites/9 tests; `pnpm build` 6/6. Post-test audit found zero hardening fixtures and zero duplicate taste-profile identities.
- Remaining issues: real authentication/ownership, ingredient-aware scaling, browser/a11y automation, and broader production operations remain intentionally out of scope.
- Recommended next phase: Phase 6 Auth and ownership boundary. Do not begin it automatically from this handoff.
- Final log: `/mnt/d/bep_nho_outputs/codex/phase-5.5-final-gates-2026-10-07.log` (outside Git).

## 2026-10-08 — Phase 6: Authentication and ownership boundary

- Commits: `884c2a6` secure credential/session boundary; `561dfda` authenticated ownership enforcement; `fe092e1` web authentication flow; `8bc29b0` auth/ownership/CSRF coverage; documentation in the following handoff commit.
- Migration: `20261008120000_auth_sessions` additively creates one-to-one `UserCredential` records and revocable `AuthSession` records, both cascading only when their owning user is deleted. Existing users and development data were not changed; `dev-local-user` intentionally has no credential.
- Passwords: Node's asynchronous `scrypt` is used to avoid a native runtime dependency. The encoded hash is versioned and contains a random 128-bit salt with parameters N=65,536, r=8, p=1 and a 64-byte output. Passwords are never trimmed, are constrained to 12–128 characters, and plaintext is neither stored nor returned.
- Sessions: login/register generate an opaque 256-bit random token. Only its SHA-256 hash is stored; lookup enforces non-revoked, non-expired sessions and active users. Sessions expire after about 30 days, update `lastUsedAt` at most every five minutes, and logout revokes the current token idempotently.
- Cookie: `bep_nho_session`; `HttpOnly`; `SameSite=Lax`; `Path=/`; approximately 30-day `Max-Age` plus server `expiresAt`; `Secure` in production and intentionally false for localhost development. No token is placed in JSON, URLs, or frontend storage.
- CSRF/CORS: a global Origin guard checks every POST/PUT/PATCH/DELETE against exact `CORS_ORIGIN` values. Missing Origin is allowed only under `NODE_ENV=test` for non-browser integration callers; development and production reject it. Credentialed CORS remains enabled only for configured origins and never uses `*`.
- Public routes: health and published recipe reads; `POST /v1/auth/register`; `POST /v1/auth/login`; idempotent `POST /v1/auth/logout` (revokes a presented session if any). Protected routes: `GET /v1/me`; all cook-session reads/mutations; `GET /v1/me/taste-profile`; and `GET/POST /v1/me/recipes/:slug/personalized-versions...`.
- Development routes: `GET /v1/dev/bootstrap` remains non-production only. `POST /v1/dev/session` creates a real database session and cookie for `dev-local-user`; both routes are absent in the production module graph and retain controller-level 404 defense.
- Ownership: cook-session creation no longer accepts `userId`; all public ownership comes from the session guard. Session reads, events, completion, feedback, personalized snapshots, and Taste DNA are scoped to that identity. Foreign object access returns 404. The old `/v1/users/:userId/taste-profile` and `/v1/users/:userId/recipes/:slug/personalized-versions` routes were removed.
- Web: `/login` and `/register` provide Vietnamese email/password forms, useful validation, and return home on success. The app always resolves identity through `/v1/me`, sends `credentials: include`, offers logout on the home page, and exposes “Dùng tài khoản dev” only in non-production builds. Public recipe browsing remains usable while signed out; cooking prompts for login.
- Tests: API now has 3 suites/17 tests. Auth coverage includes normalized/duplicate registration, scrypt storage, generic login failures, cookie attributes, token hashing, `/me`, expiry/revocation/deletion/inactive-user denial, logout, development sessions, and production development-route denial. Two-user HTTP coverage proves 404 IDOR behavior, rejects body `userId`, confirms old routes are absent, validates allowed/foreign/missing Origin policy, and checks credential-safe CORS. Phase 5.5 concurrency/provenance tests remain green.
- Final verification: Prisma 6.19.3 schema validation passed; all 6 migrations are current; typecheck 6/6; test 7/7 workspace tasks with API 17/17; build 6/6 including `/login` and `/register`. Production smoke returned health 200, both development endpoints 404, unauthenticated `/v1/me` 401, and missing-Origin login 403. Fixture audit found zero Phase 6 credentials/recipes, hardening users, duplicate taste profiles, or test development sessions.
- Known limitations: no email verification, password reset, MFA, session/device management UI, periodic expired-session cleanup, or login/rate-limit protection yet. SameSite=Lax assumes a same-site web/API deployment. Browser E2E/accessibility automation and broader operations/observability are still pending. Authentication does not by itself make the product public-production ready.
- Recommended next phase: Phase 7 — alpha content and cooking reliability (culinary-reviewed recipes, ingredient-aware scaling, active timers, resume, and a minimal offline queue). Do not begin it automatically from this handoff.

## 2026-10-08 — Phase 7: Alpha content and cooking reliability

- Commits: `6662aae` scalable alpha recipe content; `3efbaa0` immutable cooking snapshots/resume; `380d80d` reliable Cook Mode and IndexedDB queue; `13e893e` Phase 7 coverage; documentation in the following handoff commit.
- Migration: `20261008153000_scaling_and_cook_snapshots` additively adds `RecipeIngredient.scalingMode`, `scalingExponent`, and nullable `roundingIncrement`, plus nullable `CookSession.snapshotJson`. Existing ingredients retain linear behavior through defaults; existing sessions remain untouched. The pre-migration audit found no duplicate recipe versions/sort orders and no active sessions; no history was deleted or rewritten.
- Alpha content: 13 explicitly versioned Vietnamese home recipes: `bo-xao-hanh-tay`, `ca-kho-tieu`, `cai-thia-xao-toi`, `canh-cai-thit-bam`, `dau-phu-sot-ca-chua`, `ga-kho-sa`, `ga-rang-gung`, `rau-muong-xao-toi`, `thit-bam-sot-ca-chua`, `thit-kho-trung`, `tom-rang-thit`, `trung-chien-thit-bam`, and `trung-sot-ca-chua`. They are alpha/test content, not claimed as chef-reviewed, nutritionally certified, safety-certified, or regionally authenticated.
- Content organization: typed manifest definitions live under `packages/database/prisma/seed-data/recipes/`, are deterministically sorted, and pass structural validation before seeding. The old `trung-chien-thit-bam` V1 is preserved; new content is V2. Seed creation is transactional and never updates/deletes an existing `RecipeVersion`; a matching version is hash-verified, while changed content requires a new version. Running the seed twice produced `created` then `verified` for all 13 versions.
- Scaling: integer servings are bounded to 1–8. `LINEAR` uses the serving ratio, `CONSERVATIVE` uses `ratio^exponent`, and `FIXED` stays unchanged. Unit/configured increments provide practical rounding. Final cook calculation is canonical quantity → serving factor → Taste personalization factor → one final rounding; the same inputs are deterministic. A serving choice creates only a CookSession, never another PersonalizedRecipeVersion.
- Personalized hash semantics: engine version is now `personalize-v2`. Effective content hash deliberately includes recipe identity, title, cuisine, base version, scaling metadata, and personalization factors in addition to cooking content. Evidence-only Taste changes remain excluded. A focused test proves a title change mints different effective content.
- Cook snapshot: session start atomically persists schema-versioned recipe identity, canonical/personalized provenance, algorithm, chosen servings, final quantities, scaling evidence, preparation/notes, steps/timers/heat/tips, and adjustments together with `session_started`. API and web share the contract. Cook Mode only renders this snapshot. Nullable legacy sessions are read through their exact referenced version/personalized snapshot with `legacyFallback: true`; fallback is not persisted or used to rewrite history.
- Resume: authenticated `GET /v1/me/cook-sessions/active` returns the current user's latest `started` session. Multiple active sessions are deliberately allowed for this MVP; ordering is newest `startedAt`, then ID. Home exposes a clear resume banner. Completed sessions are excluded, foreign data remains 404, and refresh/browser restart reconstructs progress from ordered events.
- Timers and sequence: `timer_started` records `{ stepNo, durationSeconds, startedAt }`; the logical `startedAt` survives offline replay and is authoritative for countdown, while `serverTime` remains receipt/audit time. `timer_completed` is emitted at expiry, but timers never block step completion. Every new client event uses a serialized per-session coordinator over `max(server clientSeq, locally queued clientSeq) + 1`, preserving the `(cookSessionId, clientSeq)` idempotency key across mixed timer/step events.
- Offline queue: IndexedDB stores only user ID, session ID, sequence, event type/time/payload, and queue creation time—never credentials or tokens. Cook Mode reads/replays only its current user+session stream through a compound index; duplicate acknowledgement removes safely, retry/auth/rejection stops only that stream, and failed items remain. Logout clears every stream for that user. Completion does not enter feedback until queued events are acknowledged and server completion succeeds. Cook Mode reports online/saving/saved/syncing/offline states and actionable replay rejection/auth errors.
- Web: discovery now has text search and an active-session banner. Detail has bounded mobile-friendly servings controls and immediate deterministic quantity preview. Dedicated `/cook/[id]` restores from the session, shows snapshot ingredients, persisted progress, real countdowns, offline state, completion, and feedback.
- Tests: API has 5 suites/24 tests before the final documentation-only pass. New coverage exercises baseline/double/half/conservative/fixed/rounding/invalid/deterministic scaling; personalization ordering and version count; immutable/legacy snapshots; title hashing; owner-scoped latest-active resume; ordered mixed events/timers; max sequence; and user-scoped queue reconciliation including duplicate acknowledgement and retained retries. Existing Phase 5.5 concurrency/provenance and Phase 6 auth/origin/production-dev-route tests remain green.
- Final gates: Prisma stays at 6.19.3; schema validation, migration status, seed validation/idempotency, typecheck 6/6, tests, and build 6/6 pass. Production smoke keeps health at 200 and both dev routes at 404. Post-test audits find no Phase 6/7/hardening fixtures, no duplicate recipe versions/sort orders/Taste profiles, and no cross-owner active-session rows. Generated/secret scan is clean for tracked files. (`pnpm lint` is not a Phase 7 final gate and remains a pre-existing broken script because ESLint is not installed and Next 15 no longer supplies `next lint`.)
- Known limitations: recipe text still needs real human culinary/editorial review; multiple active sessions have no list/cancel UI; pause/resume timers and offline feedback/session-completion queueing are out of scope; IndexedDB behavior has pure reconciliation tests but no browser E2E; legacy fallback cannot freeze mutable recipe display until a new snapshotted cook is created; content publishing still uses seeds.
- Recommended next phase: Phase 8 — user control over learning (Taste DNA history/explanation, accept/reject/edit, manual overrides/reset, and “My Best Version”). Do not begin it automatically from this handoff.

## 2026-10-08 — Phase 7.5: Cooking reliability hardening

- Commits: `732182e` logical timers, session-isolated queues, serialized event emission, and rounding consistency; `f62fdd8` focused reliability/regression coverage; documentation in the following handoff commit.
- Database: no PostgreSQL schema change or migration was required. Prisma remains exactly 6.19.3 and all seven existing migrations remain unchanged.
- Timer semantics: every new `timer_started` event carries an ISO `payload.startedAt` generated once at the user action. IndexedDB, retries, API persistence, refresh, and reconnect preserve this value. Countdown uses it instead of receipt `serverTime`, so a 10-minute offline timer started at 12:00 and received at 12:05 still ends at 12:10. Legacy events without `startedAt` retain the old server/client timestamp fallback. Duplicate start/completion retries remain protected by the existing session+sequence idempotency key.
- Queue isolation: IndexedDB database `bep-nho-cook-v1` is safely upgraded from schema version 1 to 2. The existing object store and queued records are preserved; a non-unique compound `userSession` index over `[userId, cookSessionId]` is added alongside the existing `userId` index. Cook Mode synchronizes only the current session stream, so an A1 retry/rejection cannot block A2. Logout still selects and removes all of User A's streams while leaving other users' records untouched; no auth material is stored.
- Event sequencing: a small in-memory coordinator serializes sequence allocation and durable IndexedDB insertion per CookSession. It maintains a per-session high-water mark over observed server/local events, so overlapping `timer_completed` and `step_completed` calls receive different monotonically increasing values and cannot overwrite the `${sessionId}:${clientSeq}` queue key. A refreshed page constructs a new coordinator and resumes from `max(server, local) + 1`; server uniqueness is unchanged.
- Rounding: CookSessionsService no longer substitutes `0.001` when `RecipeIngredient.roundingIncrement` is null. Null/undefined now reaches the shared domain scaler and consistently selects the unit default (`ml`/`g` 1, `quả` 0.5, etc.); explicit increments still override it. Canonical and personalized integration tests compare domain preview output with persisted session snapshots.
- Tests: API now has 6 suites/30 tests. New deterministic coverage includes online/offline/reconnected/refreshed timer reconstruction, logical expiry, duplicate timer start/completion, three-user/session queue isolation, logout selection, simultaneous event allocation/insertion, refresh sequence recovery, null/explicit unit rounding, canonical/personalized preview-to-snapshot equality, and all prior Phase 5.5/6/7 regression suites.
- Final gates: `pnpm db:validate`, typecheck 6/6, test 8/8 workspace tasks, and build 6/6 pass; production health/dev-route/Origin smoke remains 200/404/403 as expected. Generated/secret scan and clean-worktree check pass. No GitHub CI claim is made.
- Known limitations: IndexedDB upgrade/replay behavior is covered through pure queue selection/reconciliation logic rather than browser E2E; multi-tab coordination is still limited to server idempotency plus distinct per-tab local coordinators; timer pause and offline feedback/session completion remain out of scope.
- Recommendation: Phase 8 may begin after explicit approval. Do not begin it automatically from this handoff.

## 2026-10-08 — Phase 8: User control over learning

- Commits: `57b119a` additive learning-control/version-provenance schema; `f75c765` Taste controls and personalized decision APIs; `5903b92` Taste DNA and best-version web UX; `7bf5e94` Phase 8 domain/database/HTTP regressions; `0103024` handoff/MVP review plus CSS compatibility cleanup; the final follow-up commit adds exact history provenance, feedback/reset replay-race coverage, and refreshes this list.
- Migration: `20261008190000_user_learning_controls` additively creates `taste_control_events`, `personalized_adjustment_decisions`, and `user_recipe_preferences`; adds `origin_type` (fast default `taste_engine`) and nullable parent provenance to personalized versions. The pre-migration audit found zero duplicate TasteProfile identities, version numbers, or content hashes; all three existing personalized rows had complete ownership keys. No signal, feedback, version, session, or recipe history was deleted or rewritten.
- Taste API/UI: authenticated `/taste` and `GET /v1/me/taste-profile` show all 11 supported dimensions, including learned/effective scores and confidence, weight/sample counts, manual override, and deterministic explanation. `GET /v1/me/taste-profile/history` is owner-scoped, bounded to 1–100 events, cursor-paginated, optionally dimension-filtered, and includes raw signal, exclusion, CookFeedback/CookSession/recipe/version provenance plus the owner's private note.
- Controls: `PATCH .../dimensions/:key/override` accepts `-1..1`, preserves explicit `0`, and clears with `null`; `POST .../reset` requires `{confirm:true}`. Both serialize with feedback through the same `taste-profile:{userId}:taste-v1` advisory lock and append `manual_override_set`, `manual_override_cleared`, or `learning_reset`. Reset zeros only the chosen dimension and clears its override while keeping raw signals/feedback, other dimensions, and profile sample/maturity counters.
- Replay: the pure domain reducer deterministically weights valid post-reset signals and excludes any signal with an exclusion reason or non-positive quality. Control/signal timestamps are made monotonic per dimension under the profile lock, so the reset boundary is unambiguous. A later valid feedback recomputes the dimension from raw post-reset evidence rather than trusting pre-reset aggregates.
- Override/engine decision: personalization is intentionally bumped from `personalize-v2` to `personalize-v3`. A non-null manual override now supplies effective confidence `1`, including at learned confidence `0`; explicit override `0` is authoritative. RecipeAdjustmentRule bounds still clamp every engine rule. Old v2 snapshots remain immutable/cookable and are not relabeled.
- Adjustment decisions: authenticated endpoints record append-only ACCEPT/REJECT/EDIT decisions against an owned source version and adjusted ingredient. ACCEPT records without creating content. REJECT restores the canonical base quantity; EDIT must stay inside the deterministic product of all applicable rule bounds and is rejected, never silently clamped, when outside it. REJECT/EDIT copy canonical and Taste provenance into an immutable `user_edit` snapshot with parent provenance; source snapshots are never updated.
- Version/hash/concurrency: user-derived hashes contain effective recipe content and exclude timestamps, decisions, and Taste evidence. Identical content reuses the existing version while every decision is still appended. The existing user-recipe advisory lock serializes lookup/version allocation, preserving unique monotonic version numbers under concurrent actions.
- My Best Version: overview explicitly returns `latestEngine`, `latestAny`, and `bestVersion`; the legacy `/latest` route remains latest-any. PUT/DELETE best-version routes validate current-user/recipe ownership with foreign or wrong-recipe IDs returning 404. Pin/unpin never mints a version, later engine suggestions do not move the pin, and the recipe UI can start a CookSession against the exact best version.
- Security/contracts: every new endpoint derives identity from `SessionAuthGuard`; no request accepts `userId`. Global Origin protection remains unchanged for PATCH/POST/PUT/DELETE. Shared contracts cover Taste history/control, version provenance, overview, decisions, and best-version UI. Explanations are fixed deterministic copy; no LLM is involved.
- Tests: API now has 8 suites/36 tests. Phase 8 covers pure replay/exclusions, explicit zero and zero-confidence override, learned-state updates beneath `-0.5`, clear/reset/audit, concurrent feedback/reset replay consistency, history cursors/private notes/exact canonical-personalized provenance, invalid bounds/confirmation, source immutability, repeated decisions, content reuse, concurrent edits, monotonic version numbers, parent/origin provenance, pin changes/unpin, wrong-recipe and foreign-version 404, exact-version scaled cooking, unauthenticated denial, and cross-user note isolation. All Phase 5.5/6/7/7.5 regressions remain green.
- Final verification: Prisma remains exactly 6.19.3; schema validation and all eight migrations are current; seed validation reports 13 recipes/27 rules and two seed runs only verified existing versions; typecheck 6/6; test 8/8 workspace tasks with API 36/36; build 6/6 including static `/taste`. Production smoke returned health 200, both dev routes 404, unauthenticated `/me` and `/me/taste-profile` 401, and missing-Origin login 403. Post-test audits found zero fixtures, duplicate Taste profiles/version numbers, or decision/preference/parent ownership mismatches.
- Known limitations: adjustment review is per ingredient rather than a bulk workflow; there is no version-library/history comparison UI, Taste export, undo event, or browser E2E/accessibility automation. Multiple rule bounds are combined multiplicatively, matching the engine's multiplicative rule factors. Operations/observability, abuse controls, account recovery, and human culinary review remain open.
- Recommended next phase: Phase 9 — delivery quality and operations. Do not begin it automatically from this handoff.

## 2026-10-09 — Phase 8.5: Personalization workflow hardening

- Commits: `dc6eeb8` composes adjustment decisions from the immediate source version; `2c85f7c` preserves active personalized versions and exposes distinct choices; `e093ce5` covers chained decisions and refresh selection; documentation is in the following handoff commit.
- Database: no schema change or PostgreSQL migration. The Phase 8 decision, parent provenance, content hash, and preference models were sufficient. Prisma remains exactly 6.19.3 and all eight migrations remain unchanged.
- Composition fix: `PersonalizationService.decide()` already enforced current-user/recipe ownership and accepted immutable `user_edit` sources. Derived snapshots now mark an edited adjustment as user-controlled, keep unrelated pending adjustments, remove only a rejected adjustment, and carry direct ACCEPT/EDIT/REJECT review state forward when the next immutable version is derived. Every decision records the actual immediate source and actual result; a newly created version points to that source as parent. Content reuse returns the existing version without changing its parent or snapshot and still appends the decision.
- Active-version fix: initial recipe selection is now `bestVersion ?? latestAny ?? latestEngine ?? canonical`, so a newer user edit survives refresh. One explicit active-version state drives ingredient preview, cooking, pinning, and decision requests. Overview refreshes after create/decision/pin actions update references without silently replacing the active version.
- Web workflow: choices are deduplicated by ID and labelled as “Bản ngon nhất”, “Bản chỉnh gần nhất”/“Bản cá nhân gần nhất”, and “Gợi ý mới nhất”. All distinct best/latest/engine versions remain reachable. EDIT/REJECT moves active state to the returned version while preserving the selected serving count; ACCEPT keeps the active source and reloads its append-only decisions so the accepted ingredient is not offered repeatedly. Subsequent actions always post the active version ID, never a hard-coded engine ID.
- Tests: the Phase 8 database fixture now has two independently adjusted ingredients. The chain engine → EDIT A → user version → REJECT B proves A is preserved, B returns to canonical, unrelated review state survives, both sources remain immutable, parent links and decision source/result IDs are exact, and repeating the chained rejection reuses content without duplicating a version. Five pure cases cover canonical fallback, engine-only selection, latest user-edit preference, best-version priority, choice deduplication, and active decision source selection.
- Final gates: `pnpm db:validate` pass; typecheck 6/6; test 8/8 workspace tasks with API 9 suites/42 tests; build 6/6. Phase 8 override/reset/replay, auth/ownership/Origin, Phase 5.5 concurrency, Phase 7 scaling/snapshots, and Phase 7.5 queues/timers remain green.
- Remaining limitations: review state is intentionally lightweight metadata plus append-only decisions, not a general workflow engine. Effective-content reuse can converge multiple decision paths on one immutable version; the decision log preserves each path, while the reused version's original parent is never rewritten. Browser E2E/accessibility and full version-history comparison remain Phase 9 candidates.
- Recommendation: Phase 9 may begin after Phase 8.5 is pushed and reviewed. Do not begin it automatically from this handoff.
