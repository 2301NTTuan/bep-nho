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
