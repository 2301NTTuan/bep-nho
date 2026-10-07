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
