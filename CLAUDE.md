# CLAUDE.md — Skrivle

Working notes for Claude Code sessions. This folder is the workspace root; work
happens here.

## What this is

Live collaborative whiteboard, portfolio piece. Read [PROJECT_BRIEF.md](PROJECT_BRIEF.md)
and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before starting work.

## Structure

- `front-end/` — Next.js + Tailwind web client
- `back-end/` — Express + Socket.IO + Yjs server
- `app-native/` — React Native, phase 2
- `coming-soon/` — static holding page for the domain root
- `docs/` — architecture, style guide, roadmap

Monorepo: this is one GitHub repo (`Elpis-alpha/Skrivle`). Each component folder
owns its own packages, dependencies, and build — treat them as independent
projects. No shared/root workspace tooling; do not add cross-folder imports
without asking. Each folder currently holds only a `.keep`.

## Conventions

- Commits are made **only** through the `commit` skill (`/commit`) — never a bare
  `git add` / `git commit`. The skill's subagent review pass is the point.
- All visual work follows [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md): Poppins,
  minimal, purple-tinted ink (not black), full amethyst `#32174D` only for the
  primary action and your own presence. Tokens live in `:root` CSS vars + a
  matching Tailwind config (both in the style guide). §1–§12 govern the product
  (`/board`, `/boards`); **§13 governs marketing surfaces** (`/`, about, privacy,
  faq, contact, terms), which may use illustrations and scroll reveals. The
  authoritative Tailwind v4 translation is `front-end/src/app/globals.css`, not
  the v3 block in §11.3.
- Keep the relational schema shallow; canvas state is a Yjs doc persisted as a
  blob snapshot, never modeled as rows. See ARCHITECTURE.md for the trade-off.
- **Postgres holds only durable records.** Sessions, sign-in codes, OAuth state,
  and rate-limit counters live in Redis (`back-end/src/redis/keys.ts` owns the
  whole keyspace). Don't add a high-churn or TTL-shaped table.
- **Anyone with a board link may edit its canvas.** Roles gate management
  (rename, delete, extend, claim), not drawing. Easy to get backwards.
- Back-end tests run against real Postgres and Redis, not mocks
  (`npm run db:test:setup` once, then `npm test`).

## Status

Phase 1. The `front-end` landing page and its static pages are built and
deployed to Cloudflare Workers at `skrivle.elpis.cc` (OpenNext); the
`coming-soon` page is live at `soon.skrivle.elpis.cc`.

The `back-end` is **built and tested** — schema + migration, three sign-in
methods (emailed code, GitHub, Google) with cross-provider account linking,
board REST, the Socket.IO↔Yjs bridge with snapshot persistence, Cloudinary
signed uploads, and the expiry sweep. It is not yet deployed. See
`back-end/README.md` for the API surface and the decisions behind it.

The two tiers are **wired together**. The front-end has a REST client
(`front-end/src/lib/api/`), a Yjs + Socket.IO session (`src/lib/realtime/`),
real sign-in (emailed code, GitHub, Google), server-minted board ids, guest
board claiming and extension, `/boards`, and live presence cursors. End-to-end
tests start a real back-end and cover sign-in and two-tab cursor sync.

**The drawing tools are the remaining v1 work** — pan/zoom and the six tools.
The Yjs document and its transport are already live, so a tool reads and writes
the root types in `front-end/src/lib/realtime/doc-schema.ts` and nothing else.
Board thumbnails are also still owed. See [docs/ROADMAP.md](docs/ROADMAP.md).

Two things worth knowing before touching this seam:

- The API types in `front-end/src/lib/api/types.ts` mirror
  `back-end/openapi.yaml` **by hand** (no codegen, no cross-folder imports), as
  do `src/lib/realtime/events.ts` and `src/lib/presence-colors.ts`. Change one
  side, change the other.
- Board data is fetched client-side on purpose. The session cookie is host-only
  on the API origin, so a Worker rendering `/board/:id` can't see it. In local
  dev it *would* be readable — same host, different port — which is exactly why
  the mistake survives testing and breaks after deploy.
