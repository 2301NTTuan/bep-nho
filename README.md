# Bếp Nhớ

Trợ lý nấu món Việt có trí nhớ khẩu vị.

## Architecture baseline
- Monorepo: pnpm workspaces + Turbo
- Web: Next.js 15 + React 19 + TypeScript
- API: NestJS + TypeScript
- DB: PostgreSQL + Prisma 6.19.3
- Cache/queue: Redis + BullMQ
- Local object storage: MinIO
- Personalization: deterministic, versioned Taste Engine

## First vertical slice
Account → Verified Recipe → Cook Mode → Feedback → Taste Signal → Personal Recipe V2.

## Local bootstrap
1. Copy `.env.example` to `.env`.
2. Run `docker compose -f infra/docker/docker-compose.yml up -d`.
3. Run `pnpm install`.
4. Run `pnpm db:generate` and `pnpm --filter @bep-nho/database db:seed`.
5. Run `pnpm dev`.

The current development identity uses `/v1/dev/bootstrap`; that route is not registered when `NODE_ENV=production`. See `docs/AI_HANDOFF.md` and `docs/MVP_REVIEW.md` for current readiness and next phases.
