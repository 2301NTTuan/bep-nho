# Bếp Nhớ

Trợ lý nấu món Việt có trí nhớ khẩu vị.

## Architecture baseline
- Monorepo: pnpm workspaces + Turbo
- Web/PWA: Next.js + TypeScript
- API: NestJS + TypeScript
- DB: PostgreSQL (Prisma planned)
- Cache/queue: Redis + BullMQ
- Local object storage: MinIO
- AI: provider-independent AI Gateway

## First vertical slice
Account → Verified Recipe → Cook Mode → Feedback → Taste Signal → Personal Recipe V2.

## Local bootstrap
1. Copy `.env.example` to `.env`.
2. Run `docker compose -f infra/docker/docker-compose.yml up -d`.
3. Run `pnpm install`.
4. Run `pnpm dev`.

The repository is a development skeleton; dependency lockfile and generated framework boilerplate will be created in the first implementation sprint.
