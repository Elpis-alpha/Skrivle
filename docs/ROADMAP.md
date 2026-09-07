# Skrivle — Roadmap

## Phase 0 — Initialization (current)

- [x] Repo structure, license, editorconfig
- [x] Project brief + architecture notes
- [x] Style guide / design system
- [x] Decide snapshot retention + scale-out stance (keep-latest, single-process — see ARCHITECTURE.md "Decisions")
- [x] Scaffold `back-end` (Express + Socket.IO + Yjs, Prisma/Postgres) — pure skeleton, subsystems stubbed
- [x] Scaffold `front-end` (Next.js + Tailwind)
- [x] Landing page + marketing surface (`/`, about, privacy, faq, contact, terms)
- [x] Back-end Docker stack (back-end container only; Postgres external, nginx still TODO)
- [x] `coming-soon` deployed (Cloudflare, `soon.skrivle.elpis.cc`)
- [x] `front-end` deployed (Cloudflare Workers / OpenNext, `skrivle.elpis.cc`)

## Phase 1 — v1 demo-ready

Goal: the four success criteria in [PROJECT_BRIEF.md](../PROJECT_BRIEF.md) are met.

- [x] Create board → redirect to `/board/:id`
- [ ] Canvas with pan/zoom (the doc and transport are live; tools plug into them)
- [x] Board REST: create, lookup, availability, rename, delete, extend, claim
- [x] Cloudinary: signed uploads for board thumbnails and avatars
- [ ] Tools: sticky note, text box, rectangle, circle, line/arrow, freehand pen
- [x] Yjs doc per board, Socket.IO relay, and the client replica
- [x] Live cursors via Yjs awareness (name + color)
- [x] Snapshot persistence (interval + last-disconnect + shutdown) and rehydrate on load
- [x] Guest boards ephemeral (24h) + creator extend (+48h)
- [x] Sign-in: emailed one-time code, GitHub, and Google (three methods, one account)
- [x] Claim guest board on sign-in; "My Boards" list
- [x] Roles: owner / editor
- [x] Expiry sweep job
- [x] `coming-soon` page + deployment
- [ ] Public demo URL (front-end shell is live at `skrivle.elpis.cc`; not "done" until the canvas ships)

## Phase 2 — Native app

- [ ] React Native viewer (read-only board rendering)
- [ ] Light editing (notes, text)

## Deferred / out of scope for v1

Comments, chat, reactions, templates, export (PDF/PNG), permission tiers beyond
owner/editor.
