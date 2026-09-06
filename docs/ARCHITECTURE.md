# Skrivle — Architecture

Status: design notes. Nothing implemented yet.

## High-level shape

```
Browser (Next.js)                 Server (Express)                PostgreSQL
  React canvas                      Socket.IO gateway               users
  Yjs doc (client replica)  <--->   Yjs doc (in-memory, per board)  boards
  Socket.IO client                  Auth (OAuth: GitHub, Google)    board_collaborators
                                    Snapshot writer                 board_snapshots
```

Hosting is split by tier. The `coming-soon/` static page and the `front-end/`
(Next.js) are served by **Cloudflare**. Only the `back-end/` runs as a Docker
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

The Yjs document is serialized to a binary blob and written to `board_snapshots`:

- periodically (e.g. every ~30s while dirty), and
- on last-user-disconnect for a board.

On first connection to a board with no in-memory doc, the server loads the latest
snapshot blob and rehydrates the Yjs doc.

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
- OAuth sign-in (GitHub / Google) creates/links a `users` row.
- Signing in while on a guest board can claim it: set `owner_id`, add an `owner`
  row to `board_collaborators`, clear `is_ephemeral` / `expires_at`.
- Roles: `owner`, `editor`. No finer tiers in v1.

## Ephemeral boards & expiry

- Guest boards: `is_ephemeral = true`, `expires_at = created_at + 24h`.
- Creator can extend by +48h (tracked without requiring sign-in — e.g. a creator
  token in the client, checked server-side).
- A sweep job deletes boards past `expires_at` (metadata rows + snapshots).

## Data model (kept shallow — CRDT state lives outside relational tables)

```
users
  id, email (verifier only, e.g. OTP login), name, avatar_url,
  provider (github/google), created_at

boards
  id, owner_id (nullable — null = anonymous/guest board), title,
  is_ephemeral (bool), expires_at (nullable), created_at, updated_at

board_collaborators
  board_id, user_id, role (owner/editor), last_active_at

board_snapshots
  id, board_id, doc_state (binary blob — serialized Yjs document), created_at
```

## Deployment

Hosted under `elpis.cc`, split by tier:

| Domain | Serves | Where |
| --- | --- | --- |
| `skrivle.elpis.cc` | `coming-soon/` now → `front-end/` once demo-ready | Cloudflare |
| `soon.skrivle.elpis.cc` | `coming-soon/` (after the front-end takes the apex) | Cloudflare |
| `api.skrivle.elpis.cc` | `back-end/` (`/socket.io` + `/api`) | Docker Compose + Nginx |

- Back-end Compose stack: `back-end`, `postgres`, `nginx`.
- Public demo URL is a v1 done-criterion.

## Open questions

- Single back-end process vs. sticky-session scale-out (board affinity) — v1 can be
  single-process.
- Snapshot retention: keep last N per board, or just the latest.
- Custom-id abuse (squatting, profanity) — allowlist/denylist or leave for later.
