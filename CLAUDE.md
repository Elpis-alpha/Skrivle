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

## Status

Phase 0 (initialization). The `front-end` landing page and its static pages are
built and deployed to Cloudflare Workers at `skrivle.elpis.cc` (OpenNext); the
`coming-soon` page is live at `soon.skrivle.elpis.cc`. The `back-end` is
scaffolded (Express + Socket.IO + Yjs + Prisma/Postgres) but is a pure skeleton:
it compiles, lints, tests, and boots, with every subsystem a `TODO(Phase 1)`
stub — see `back-end/README.md`. The canvas and auth are not built. `/board/:id`
is a placeholder route, and board ids are minted client-side until the create
API exists (see `front-end/src/lib/board-id.ts`, mirrored in
`back-end/src/boards/board-id.ts`). See [docs/ROADMAP.md](docs/ROADMAP.md).
