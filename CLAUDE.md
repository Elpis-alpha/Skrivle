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
- DB migrations auto-apply on back-end container start
  (`back-end/docker-entrypoint.sh` → `prisma migrate deploy`, which crash-loops
  the container on repeated failure). Create them with `npm run prisma:migrate`;
  `prisma` is a runtime dep so the CLI ships in the image.

## Status

Phase 1 is done and deployed. The `front-end` (Cloudflare Workers, OpenNext) is
live at `skrivle.elpis.cc`; the `back-end` (Docker + Nginx) is live at
`api.skrivle.elpis.cc`; the `coming-soon` page is live at
`soon.skrivle.elpis.cc`. Both tiers are up, wired together, and reachable by
the public — this is a real v1, not a front-end shell in front of a stub.

The `back-end` has schema + migration, three sign-in methods (emailed code,
GitHub, Google) with cross-provider account linking, board REST, the
Socket.IO↔Yjs bridge with snapshot persistence, Cloudinary signed uploads, and
the expiry sweep — all built, tested, and now live. See `back-end/README.md`
for the API surface and the decisions behind it.

The two tiers are **wired together**. The front-end has a REST client
(`front-end/src/lib/api/`), a Yjs + Socket.IO session (`src/lib/realtime/`),
real sign-in (emailed code, GitHub, Google), server-minted board ids, guest
board claiming and extension, `/boards`, and live presence cursors. End-to-end
tests start a real back-end and cover sign-in and two-tab cursor sync.

**The canvas is built.** Pan/zoom, the eight tools, selection with marquee and
resize, undo/redo, and client-rendered board thumbnails. The element schema
lives in `front-end/src/lib/realtime/doc-schema.ts`; every write goes through
`src/lib/board/elements.ts`, which wraps each gesture in one `doc.transact` under
the `LOCAL` origin. What's left for the roadmap is Phase 2, the native app — see
[docs/ROADMAP.md](docs/ROADMAP.md).

Four things worth knowing before touching this seam:

- **A `Y.Map`'s own observer does not fire for changes inside a nested `Y.Text`
  or `Y.Array`,** and a *deleted* type's observer never fires at all. So an
  element hook subscribes to its own map **and** to the parent `elements` map
  (the only thing that reports its own deletion), while text and pen samples get
  their own subscriptions. `src/lib/realtime/useElements.ts` has the detail.
- **The camera never goes through React state.** `CameraLayer` writes the
  transform and `--cam-scale` from a rAF, so a wheel tick doesn't reconcile
  every element — and, more importantly, remote cursors share that one transform
  rather than landing a frame behind it.
- **Local rendering runs at animation rate; the network never does.** Drags and
  strokes paint every frame but only write to the doc every `PUBLISH_MS` (50ms).
  Socket.IO sends a binary event as two frames and nothing rate-limits sockets,
  so writing per sample would be ~120 frames/sec per person drawing.
- **React registers `wheel` as a passive listener,** so `preventDefault()` in an
  `onWheel` prop does nothing. Zoom is a native listener with `passive: false`.

Two more, about the tiers:

- The API types in `front-end/src/lib/api/types.ts` mirror
  `back-end/openapi.yaml` **by hand** (no codegen, no cross-folder imports), as
  do `src/lib/realtime/events.ts` and `src/lib/presence-colors.ts`. Change one
  side, change the other.
- Board data is fetched client-side on purpose. The session cookie is host-only
  on the API origin, so a Worker rendering `/board/:id` can't see it. In local
  dev it *would* be readable — same host, different port — which is exactly why
  the mistake survives testing and breaks after deploy.
