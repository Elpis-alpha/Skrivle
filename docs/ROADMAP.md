# Skrivle — Roadmap

## Phase 0 — Initialization

- [x] Repo structure, license, editorconfig
- [x] Project brief + architecture notes
- [x] Style guide / design system
- [x] Decide snapshot retention + scale-out stance (keep-latest, single-process — see ARCHITECTURE.md "Decisions")
- [x] Scaffold `back-end` (Express + Socket.IO + Yjs, Prisma/Postgres) — pure skeleton, subsystems stubbed
- [x] Scaffold `front-end` (Next.js + Tailwind)
- [x] Landing page + marketing surface (`/`, about, privacy, faq, contact, terms)
- [x] Back-end Docker stack (back-end container + Nginx; Postgres external)
- [x] Back-end migrations auto-apply on deploy (entrypoint `prisma migrate deploy`)
- [x] `coming-soon` deployed (Cloudflare, `soon.skrivle.elpis.cc`)
- [x] `front-end` deployed (Cloudflare Workers / OpenNext, `skrivle.elpis.cc`)

## Phase 1 — v1 demo-ready

Goal: the four success criteria in [PROJECT_BRIEF.md](../PROJECT_BRIEF.md) are met.

- [x] Create board → redirect to `/board/:id`
- [x] Canvas with pan/zoom (wheel/trackpad, space- or middle-drag, Hand tool)
- [x] Board REST: create, lookup, availability, rename, delete, extend, claim
- [x] Cloudinary: signed uploads for board thumbnails and avatars
- [x] Tools: sticky note, text box, rectangle, circle, line/arrow, freehand pen
- [x] Select, marquee multi-select, move, resize, delete, and undo/redo
- [x] Board thumbnails rendered client-side and uploaded to Cloudinary
- [x] Yjs doc per board, Socket.IO relay, and the client replica
- [x] Live cursors via Yjs awareness (name + color)
- [x] Snapshot persistence (interval + last-disconnect + shutdown) and rehydrate on load
- [x] Guest boards ephemeral (24h) + creator extend (+48h)
- [x] Sign-in: emailed one-time code, GitHub, and Google (three methods, one account)
- [x] Claim guest board on sign-in; "My Boards" list
- [x] Roles: owner / editor
- [x] Expiry sweep job
- [x] `coming-soon` page + deployment
- [x] Public demo URL — `back-end` deployed to `api.skrivle.elpis.cc` (Docker + Nginx); the canvas at `skrivle.elpis.cc` is live end to end

## Phase 2 — Native app

Not started; no timeline. v1 (Phase 0 + 1) is complete and live.

- [ ] React Native viewer (read-only board rendering)
- [ ] Light editing (notes, text)

## Deferred / out of scope for v1

Comments, chat, reactions, templates, export (PDF/PNG), permission tiers beyond
owner/editor.
