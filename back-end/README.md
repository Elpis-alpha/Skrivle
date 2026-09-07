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
production — both via `DATABASE_URL`. Redis **is** bundled (see Docker below);
point `REDIS_URL` at `localhost` for a host-run process.

## Docker

The Compose stack is the back-end plus Redis; Postgres stays external.

```bash
docker compose build
docker compose up
```

The container reaches a local dev database at `host.docker.internal` (wired in
[`docker-compose.yml`](docker-compose.yml)); point `DATABASE_URL` there. Redis
runs as the `redis` service and the container's `REDIS_URL` is overridden to
`redis://redis:6379`.

## Layout

| Path | Role |
| --- | --- |
| `src/index.ts` / `src/server.ts` | boot + Express/Socket.IO assembly |
| `src/lifecycle.ts` | graceful shutdown — drains hooks so no board is lost on SIGTERM |
| `src/config/env.ts` | typed environment (loads `.env` via `process.loadEnvFile`) |
| `src/db/prisma.ts` | PrismaClient singleton + health check |
| `src/redis/` | client, the whole keyspace (`keys.ts`), rate limiting |
| `src/auth/` | sessions, one-time codes, identity linking, OAuth, middleware |
| `src/mail/` | nodemailer over Gmail OAuth2 + the sign-in code template |
| `src/media/cloudinary.ts` | signed direct uploads, delivery URLs, cleanup |
| `src/boards/` | id rules (mirrors the front-end) + board service |
| `src/http/` | `/api` routes (`boards`, `auth`, `uploads`, `me`) + middleware |
| `src/http/openapi.ts` / `openapi.yaml` | hand-authored OpenAPI 3.1 spec, served at `/api/openapi.json` and rendered by Scalar at `/docs` |
| `src/realtime/` | Socket.IO gateway, doc registry, Yjs bridge, awareness, snapshots |
| `src/jobs/expiry-sweep.ts` | deletes boards past `expires_at`, and their thumbnails |
| `src/presence/cursor-colors.ts` | cursor palette, mirrors the front-end order |
| `src/protocol/events.ts` | Socket.IO event names + wire-protocol reference |
| `prisma/schema.prisma` | five shallow tables, no append-only growth |

## API

```
GET    /healthz                      { ok, db, redis }

POST   /api/auth/email/request       { email }        -> { ok, expiresInSeconds }
POST   /api/auth/email/verify        { email, code }  -> { user } + session cookie
GET    /api/auth/github|google       ?returnTo&claim  -> 302 to the provider
GET    /api/auth/callback/:provider  ?code&state      -> 302 back to the front-end
GET    /api/auth/me                                   -> { user, methods }
POST   /api/auth/logout | /logout/all                 -> 204

POST   /api/boards                   { customId?, title? } -> board + creatorToken
GET    /api/boards                                    -> My Boards
GET    /api/boards/:id                                -> board | 404 gone | 410 expired
GET    /api/boards/:id/available                      -> { available }
PATCH  /api/boards/:id               { title }
DELETE /api/boards/:id
POST   /api/boards/:id/extend        { creatorToken } -> { expiresAt }
POST   /api/boards/:id/claim         { creatorToken } -> board
POST   /api/boards/:id/thumbnail     { publicId }     -> { thumbnailUrl }

POST   /api/uploads/signature        { kind, boardId? } -> Cloudinary params
PATCH  /api/me                       { name?, avatarPublicId? }
```

Interactive reference (Scalar) at **`/docs`**; the raw document at
**`/api/openapi.json`**. Both are public. The spec is hand-authored in
`openapi.yaml` — `src/http/openapi.test.ts` validates it and checks it against
the live route table on every test run.

The realtime protocol is documented at the top of `src/protocol/events.ts`. The
board is chosen in the Socket.IO **handshake**, not by an event.

## A few decisions worth knowing

- **Postgres holds only durable records.** Sessions, sign-in codes, OAuth state,
  and rate-limit counters are all in Redis, where TTL is native. No table in the
  schema is append-only.
- **Anyone with a board link can edit it.** That is the product. Roles gate
  management (rename, delete, extend, claim), not drawing.
- **Uploads go browser-to-Cloudinary** against a server-minted signature, so no
  image data passes through this process. Public ids are derived from the board
  or user id, which makes a signature impossible to point at someone else's asset.
- **OAuth is hand-rolled** for two providers (~150 LOC in `src/auth/oauth/`)
  rather than pulled from a library. Linking across providers requires a
  provider-*verified* email.

## Testing

```bash
npm test
```

Set the test database up once with `npm run db:test:setup`.

Tests run against a real Postgres (`skrivle_test`) and the
Redis from `docker-compose.yml` — the code leans on atomic `INCR`, TTL semantics,
and Prisma cascades, which a mock would only reimplement. `src/test/setup.ts`
refuses to run if the database name does not contain `skrivle_test`.

## Still to build

- **Canvas client:** the front-end half of the realtime protocol, plus the
  thumbnail render-and-upload cadence.
- **Front-end wiring:** an API base-URL env var, replacing the client-side
  `generateBoardId` with the create-board call, and the My Boards UI.
- **Ops:** Nginx (TLS + reverse proxy for `/api` and `/socket.io`) and the
  deploy pipeline for `api.skrivle.elpis.cc`.
