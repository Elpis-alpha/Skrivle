# Skrivle

A live collaborative whiteboard. Create a board, start drawing or writing instantly —
no signup. Share the URL and others join and edit in real time. Optional sign-in
persists boards long-term.

> **Status: coming soon.** This repo currently holds documentation and structure only.
> No application code yet.

## Repository layout

Monorepo — one GitHub repo, one top-level folder per component. Each folder owns
its own packages, dependencies, and build; there is no shared workspace tooling
across them.

| Folder | What it is |
| --- | --- |
| [`front-end/`](front-end/) | React / Next.js + Tailwind web client |
| [`back-end/`](back-end/) | Node.js / Express + Socket.IO + Yjs server |
| [`app-native/`](app-native/) | React Native app — phase 2 viewer / light editor |
| [`coming-soon/`](coming-soon/) | Static holding page served at the domain root until launch |
| [`docs/`](docs/) | Architecture, style guide, roadmap |

## Documentation

- [PROJECT_BRIEF.md](PROJECT_BRIEF.md) — what Skrivle is, why it exists, scope
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, data model, real-time sync
- [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md) — design system: color, type, components, tokens
- [docs/ROADMAP.md](docs/ROADMAP.md) — build phases and v1 done criteria
- [CLAUDE.md](CLAUDE.md) — working notes for Claude Code sessions

## Tech stack

React/Next.js · Tailwind · Socket.IO · Yjs (CRDT) · Node.js/Express · PostgreSQL ·
OAuth (GitHub + Google) · Docker Compose · Nginx

## License

[MIT](LICENSE)
