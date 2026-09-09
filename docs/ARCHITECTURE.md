# Skrivle — Architecture

Status: the back-end is built — schema, auth, REST, realtime, and media.
The canvas client is not. See docs/ROADMAP.md.

## High-level shape

```
Browser (Next.js)                 Server (Express)                PostgreSQL
  React canvas                      Socket.IO gateway               users
  Yjs doc (client replica)  <--->   Yjs doc (in-memory, per board)  boards
  Socket.IO client                  Auth (email code / GitHub / Google)  board_collaborators
                                    Snapshot writer                 board_snapshots
```

Hosting is split by tier. The `coming-soon/` static page and the `front-end/`
(Next.js, deployed via OpenNext) are served by **Cloudflare**. Only the `back-end/` runs as a Docker
Compose stack, with **Nginx** terminating TLS and reverse-proxying `/socket.io`
+ `/api` to the Express server. See [Deployment](#deployment) for domains.

## Real-time sync model

The live canvas state for a board is a **single Yjs CRDT document**, held in memory
on the server while at least one user is connected. Clients hold a replica and
exchange Yjs updates with the server over Socket.IO. Yjs handles conflict
resolution; the server is a relay plus the authority on persistence.

- **Awareness** (live cursors, name, color) rides the Yjs awareness protocol —
  ephemeral, never persisted.
- **Document updates** (shapes, notes, text, strokes) are Yjs updates — applied to
  the in-memory doc and fanned out to other clients in the board room.

### Persistence: snapshots, not rows

The Yjs document is serialized to a binary blob and written to `board_docs`:

- periodically (every 30s while dirty),
- on last-user-disconnect for a board, and
- on shutdown, before the process exits.

On first connection to a board with no in-memory doc, the server loads the blob
and rehydrates the Yjs doc.

**Retention is keep-latest** — exactly one row per board, overwritten in place.
A Yjs update encodes the document's whole history, so the newest blob is
self-sufficient; keeping older ones would buy recovery from a corrupt write at
the cost of an unbounded table and an index scan on every rehydrate.

The blob lives in its own table rather than a column on `boards` because it
grows to megabytes, and the three hot reads — My Boards, board lookup, the
expiry sweep — must never drag it off disk. Rehydration is then a single
primary-key fetch.

**Trade-off to be ready to explain:** individual shapes/elements are *not* rows.
This makes real-time sync and conflict resolution simple and fast, at the cost of
not being able to run relational queries like "find all rectangles across all
boards" — which is not a requirement here.

## Board identity

- Default id: 5 alphanumeric characters, generated server-side, collision-checked.
- Optional custom id: a unique string chosen at creation, immutable afterwards.
- `/board/:id` is the only entry point; unknown ids offer to create that board.

## Auth & ownership

- Guests need no account. A guest board has `owner_id = NULL`.
- Sign-in — an emailed one-time code, or OAuth (GitHub / Google) — creates or
  links a `users` row via an `identities` row per provider, so one person signing
  in with Google today and GitHub tomorrow lands on the same account and boards.
- **Linking requires a provider-verified address.** An unverified email that
  collides with an existing account is refused rather than linked; otherwise
  anyone able to type a victim's address into a sloppy provider's profile could
  walk into their account.
- Sessions and sign-in codes live in **Redis**, not Postgres — both are
  high-churn and TTL-shaped. Sessions are opaque random tokens in an HttpOnly
  cookie; only their HMAC is stored, so a Redis dump yields nothing replayable.
- **Anyone holding a board link may edit its canvas.** Roles gate *management*
  (rename, delete, extend, claim, My Boards membership), not drawing.
- Signing in while on a guest board can claim it: set `owner_id`, add an `owner`
  row to `board_collaborators`, clear `is_ephemeral` / `expires_at`.
- Roles: `owner`, `editor`. No finer tiers in v1.

## Ephemeral boards & expiry

- Guest boards: `is_ephemeral = true`, `expires_at = created_at + 24h`.
- Creator can extend by +48h (tracked without requiring sign-in — e.g. a creator
  token in the client, checked server-side).
- A sweep job deletes boards past `expires_at` every 15 minutes (metadata rows,
  the stored doc, and the Cloudinary thumbnail, which no database cascade
  reaches). A board with people still connected is skipped until they leave.

## Data model (kept shallow — CRDT state lives outside relational tables)

Nothing here is append-only: no table grows unless the number of boards or
users does. Everything short-lived is in Redis.

```
users
  id, email (unique, always set), name, avatar_url, avatar_public_id,
  created_at, updated_at

identities                       one row per (provider, account)
  id, user_id, provider (email/github/google), provider_account_id,
  created_at
  unique (provider, provider_account_id)
  -- deliberately no access/refresh token columns: no provider API is called
  -- after sign-in, so storing them would be liability without use

boards
  id (lowercased), owner_id (nullable — null = anonymous/guest board), title,
  is_ephemeral (bool), expires_at (nullable), creator_token_hash,
  thumbnail_id (Cloudinary public_id), created_at, updated_at

board_collaborators
  board_id, user_id, role (owner/editor), last_active_at
  index (user_id)  -- My Boards filters on user_id alone; the composite PK
                   -- leads with board_id and cannot serve it

board_docs                       exactly one row per board, overwritten
  board_id (PK), doc_state (binary blob — serialized Yjs document), updated_at
```

### Redis keyspace

```
sess:<hmac(sid)>      session record          30d, sliding
usess:<user_id>       that user's sessions    30d      (revoke-all)
otp:<hmac(email)>     sign-in code + attempts 10m
otpcool:<hmac(email)> resend cooldown         60s
oauth:<state>         handshake state, PKCE   10m      (one-shot)
rl:<bucket>:<subject> rate-limit counter      per-rule
```

## Deployment

Hosted under `elpis.cc`, split by tier:

| Domain | Serves | Where |
| --- | --- | --- |
| `skrivle.elpis.cc` | `front-end/` — **live** | Cloudflare Workers (OpenNext) |
| `soon.skrivle.elpis.cc` | `coming-soon/` — **live** | Cloudflare |
| `api.skrivle.elpis.cc` | `back-end/` (`/socket.io` + `/api`) — **live** | Docker Compose + Nginx |

- The front-end took the apex and `coming-soon/` moved to `soon.` on 2026-09-06;
  the API tier followed, and all three domains are live.
- Back-end Compose stack: `back-end` + `redis` (Postgres is external; Nginx is
  the VPS host's, not a container). A profile-gated `migrate` service shares the
  image for ad-hoc migration runs.
- **Migrations apply on container start.** `back-end/docker-entrypoint.sh` runs
  `prisma migrate deploy` before the server process; repeated failure crash-loops
  the container rather than serving a stale schema — safe because there is
  exactly one back-end process. Ad-hoc:
  `docker compose --profile migrate run --rm migrate {status,deploy}`.
- The front-end URL is public, but the v1 "working demo URL" criterion is not met
  until the canvas ships.

## Decisions

- **Snapshot retention: keep-latest.** One `board_docs` row per board,
  overwritten. See "Persistence" above.
- **Single back-end process.** The Socket.IO Redis adapter alone would not make
  this safe: two processes each holding the same `Y.Doc` would both write
  snapshots. Real scale-out needs board affinity (sticky routing on board id),
  which is a later change; `redis/client.ts` already exposes `duplicateClient()`
  so the adapter drops in without restructuring.
- **Email delivery: nodemailer over Gmail OAuth2.** Fine for a demo, with two
  ceilings: ~500 sends/day, and the refresh token expires every 7 days unless the
  mail project's consent screen is moved out of "Testing". A transactional
  provider is the upgrade path.
- **Media: Cloudinary**, for board thumbnails and uploaded avatars. Uploads go
  browser-to-Cloudinary against a server-minted signature, so no multipart body
  passes through Express. Public ids are derived from the board or user id, which
  makes them unforgeable and makes re-uploads overwrite rather than accumulate.

## Still open

- Custom-id abuse (squatting, profanity) — allowlist/denylist or leave for later.
- Board thumbnails are rendered and uploaded by the client; the cadence (on
  navigate-away, debounced while dirty) lands with the canvas.
