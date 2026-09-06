# Skrivle

A live collaborative whiteboard. Create a board, start drawing or writing instantly —
no signup. Share the URL and others join and edit in real time. Optional sign-in
persists boards long-term.

> **Status: coming soon.** This repo currently holds documentation and structure only.
> No application code yet.

## Repository layout

This is a workspace folder, not a single deployable. Each component is developed here
and split into its own repo (polyrepo) once it has substance.

| Folder | What it is | Future repo |
| --- | --- | --- |
| [`front-end/`](front-end/) | React / Next.js + Tailwind web client | `skrivle-front-end` |
| [`back-end/`](back-end/) | Node.js / Express + Socket.IO + Yjs server | `skrivle-back-end` |
| [`app-native/`](app-native/) | React Native app — phase 2 viewer / light editor | `skrivle-app-native` |
| [`comming-soon/`](comming-soon/) | Static holding page served at the domain root until launch | — |
| [`docs/`](docs/) | Architecture and roadmap | — |

## Documentation

- [PROJECT_BRIEF.md](PROJECT_BRIEF.md) — what Skrivle is, why it exists, scope
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, data model, real-time sync
- [docs/ROADMAP.md](docs/ROADMAP.md) — build phases and v1 done criteria
- [CLAUDE.md](CLAUDE.md) — working notes for Claude Code sessions

## Tech stack

React/Next.js · Tailwind · Socket.IO · Yjs (CRDT) · Node.js/Express · PostgreSQL ·
OAuth (GitHub + Google) · Docker Compose · Nginx

## License

[MIT](LICENSE)
