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
- `comming-soon/` — static holding page for the domain root
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
  matching Tailwind config (both in the style guide).
- Spelling `comming-soon` is intentional (matches the folder name).
- Keep the relational schema shallow; canvas state is a Yjs doc persisted as a
  blob snapshot, never modeled as rows. See ARCHITECTURE.md for the trade-off.

## Status

Phase 0 (initialization). Docs and structure only, no application code.
See [docs/ROADMAP.md](docs/ROADMAP.md).
