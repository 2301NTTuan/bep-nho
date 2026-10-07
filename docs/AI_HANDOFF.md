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
