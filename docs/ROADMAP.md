# Skrivle — Roadmap

## Phase 0 — Initialization (current)

- [x] Repo structure, license, editorconfig
- [x] Project brief + architecture notes
- [x] Style guide / design system
- [ ] Decide snapshot retention + scale-out stance (scaffold assumes keep-latest + single-process — confirm)
- [x] Scaffold `back-end` (Express + Socket.IO + Yjs, Prisma/Postgres) — pure skeleton, subsystems stubbed
- [x] Scaffold `front-end` (Next.js + Tailwind)
- [x] Landing page + marketing surface (`/`, about, privacy, faq, contact, terms)
- [x] Back-end Docker stack (back-end container only; Postgres external, nginx still TODO)
- [x] `coming-soon` deployed (Cloudflare, `soon.skrivle.elpis.cc`)
- [x] `front-end` deployed (Cloudflare Workers / OpenNext, `skrivle.elpis.cc`)

## Phase 1 — v1 demo-ready

Goal: the four success criteria in [PROJECT_BRIEF.md](../PROJECT_BRIEF.md) are met.

- [ ] Create board → redirect to `/board/:id` (default 5-char id, optional custom id)
- [ ] Canvas with pan/zoom
- [ ] Tools: sticky note, text box, rectangle, circle, line/arrow, freehand pen
- [ ] Yjs doc per board, Socket.IO relay, client replica
- [ ] Live cursors via Yjs awareness (name + color)
- [ ] Snapshot persistence (interval + last-disconnect) and rehydrate on load
- [ ] Guest boards ephemeral (24h) + creator extend (+48h)
- [ ] OAuth sign-in (GitHub + Google)
- [ ] Claim guest board on sign-in; "My Boards" list
- [ ] Roles: owner / editor
- [ ] Expiry sweep job
- [x] `coming-soon` page + deployment
- [ ] Public demo URL (front-end shell is live at `skrivle.elpis.cc`; not "done" until the canvas ships)

## Phase 2 — Native app

- [ ] React Native viewer (read-only board rendering)
- [ ] Light editing (notes, text)

## Deferred / out of scope for v1

Comments, chat, reactions, templates, export (PDF/PNG), permission tiers beyond
owner/editor.
