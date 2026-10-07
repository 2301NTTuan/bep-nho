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
