# Skrivle — back-end

Node.js + TypeScript API and realtime gateway: Express (`/api`), Socket.IO
(`/socket.io`), a Yjs document per board held in memory, and PostgreSQL (via
Prisma) for board metadata and snapshot blobs.

See the repo root for context: [`PROJECT_BRIEF.md`](../PROJECT_BRIEF.md),
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md),
[`docs/ROADMAP.md`](../docs/ROADMAP.md).

## Commands

```bash
npm install              # install dependencies
npm run prisma:generate  # generate the Prisma client (required before build/dev)
npm run dev              # dev server, reload on change — http://localhost:4000 (tsx)
npm run build            # type-check + compile to dist/
npm run start            # run the compiled server
npm run lint             # ESLint (flat config)
npm test                 # Vitest (run once)
npm run test:watch       # Vitest in watch mode
npm run prisma:migrate   # create + apply a dev migration (needs a running Postgres)
```

## Environment

Copy [`.env.example`](.env.example) to `.env` and fill it in. Postgres is **not**
bundled: use a local install in development and an external managed database in
production — both via `DATABASE_URL`.

## Docker

Only the back-end is containerised.

```bash
docker compose build
docker compose up
```

The container reaches a local dev database at `host.docker.internal` (wired in
[`docker-compose.yml`](docker-compose.yml)); point `DATABASE_URL` there.

## Layout

| Path | Role |
| --- | --- |
| `src/index.ts` / `src/server.ts` | boot + Express/Socket.IO assembly |
| `src/config/env.ts` | typed environment |
| `src/db/prisma.ts` | PrismaClient singleton |
| `src/http/` | `/api` routes (`boards`, `auth`) + error/not-found middleware |
| `src/realtime/` | Socket.IO gateway, in-memory doc registry, Yjs bridge, snapshot writer |
| `src/boards/board-id.ts` | id generation + validation, mirrors the front-end rules |
| `src/presence/cursor-colors.ts` | cursor palette, mirrors the front-end order |
| `src/protocol/events.ts` | Socket.IO event names + wire-message reference |
| `prisma/schema.prisma` | the four shallow tables |

## Status — scaffold only

Compiles, lints, tests, and boots. Room management and awareness relay in the
gateway work; everything else is a stub carrying a `TODO(Phase 1)` and a pointer
to the governing doc section. Still to build (see
[`docs/ROADMAP.md`](../docs/ROADMAP.md)):

- **Realtime:** the Socket.IO ↔ Yjs bridge (`src/realtime/yjs-bridge.ts`), doc
  rehydration and snapshot persistence (`doc-manager.ts`, `snapshot-writer.ts`).
- **REST:** board create / lookup / availability / extend / claim
  (`src/http/routes/boards.ts`) with real Prisma queries and a first migration.
- **Auth:** OAuth (GitHub + Google), sessions, collaborator roles, guest-board
  claiming (`src/http/routes/auth.ts`). The OAuth library is not chosen yet.
- **Jobs:** the sweep that deletes boards past `expires_at`.
- **Ops:** Nginx (TLS + reverse proxy for `/api` and `/socket.io`) and the
  deploy pipeline for `api.skrivle.elpis.cc`.
- **Front-end wiring:** an API base-URL env var, and replacing the client-side
  `generateBoardId` with the create-board call.
