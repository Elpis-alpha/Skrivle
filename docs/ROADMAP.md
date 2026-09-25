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

## Phase 1.5 — Board polish

v1 works; this pass is about what a visitor sees in their first minute on a
board. Front-end only — no doc schema or wire-format changes.

- [x] Ink keeps up with the pointer: pen, resize and draw-out paint every frame
- [x] A peer's moves and resizes ease in instead of landing in 50ms steps
- [x] Tapered pen ink; shape outlines no longer clipped to their box
- [x] Share button + dialog, inline title rename, toasts
- [x] Zoom control, fit to content, and fit on load
- [x] Empty-board hint
- [x] Peers' selections shown on the board
- [x] Copy, paste, duplicate

## Phase 1.6 — Review follow-ups

From a review of the live board (2026-09-25), in the order they should be done:
live bugs first, then the safety net that would have caught them, editing
basics, the style guide's unkept promises, hardening, and finally features past
the v1 scope.

**Bugs**

- [x] A text box no longer grows forever while you type in it (React #185) — the
  editor measured it as if it had a note's padding
- [x] Notes and text boxes reopen for typing: double-click, Enter, or the Text
  tool on existing text (§10.7)
- [x] An edit that lands while a snapshot is being written stays queued, rather
  than being marked saved and lost on the next deploy
- [x] Element hooks no longer miss a doc change that lands between an element's
  first render and its subscription: the doc clears the snapshot caches in
  `useElements.ts`, not the subscription

**Safety net**

- [x] Error boundary on `/board/:id`, in the §10.21 voice with a Reload — a render
  error used to blank the whole page
- [x] Error reporting, client and server: browsers post what they catch to
  `POST /api/errors`, and it lands in the API's log beside the API's own errors,
  one `[skrivle] error` line each

**Editing basics**

- [x] Arrow keys nudge the selection (1px, Shift for 10px), one undo step per
  burst; Cmd/Ctrl+A selects all. A style change, and typing into a note
  reopened with Enter, are now their own undo steps too
- [x] Z-order: `]` / `[` bring to front / send to back, Cmd for one step — writes
  only `order`, which is kept separate for exactly this
- [x] An empty text box is removed when editing ends, in the undo step that made
  it, so Cmd+Z doesn't bring it back
- [x] Touch: pinch-zoom and two-finger pan. A cancelled gesture now takes back
  what it did, and a note is placed on release, so a pinch leaves nothing behind

**Style guide, not yet kept**

- [ ] Dashed border on hovering a text box (§10.9), driven by the hover hit-test
  since elements take no pointer events
- [ ] "Back online" toast (§10.21); the reconnect bar's "saved locally" is only
  true in memory until offline persistence lands
- [ ] Avatar cluster popover: who's here, and their role (§10.11)
- [ ] My Boards tile menu — Rename, Delete with a confirm, Duplicate (needs a copy
  endpoint) — and "edited 2h ago" (§10.15)

**Hardening**

- [ ] Socket limits: a per-socket token bucket on sync and awareness updates, a
  cap on a board's encoded size, and awareness updates limited to the socket's
  own client ids
- [ ] Offline persistence (`y-indexeddb`), so a reload while offline keeps
  unsynced work
- [ ] An update log between snapshots, so a crash loses nothing rather than up
  to 30s

**Past v1 scope**

- [ ] Export to PNG / SVG, reusing the thumbnail renderer at full resolution
- [ ] Follow a collaborator's viewport (shared through awareness)
- [ ] Resize a multi-selection as a group
- [ ] Text inside shapes (an additive `Y.Text` on rect and ellipse)
- [ ] Images on the canvas (a new `image` kind; Cloudinary signing exists)
- [ ] View-only share links
- [ ] Render only the elements near the viewport — after measuring a
  1,000-element board, and with a margin, since ink overhangs its box

## Phase 2 — Native app

Not started; no timeline. v1 (Phase 0 + 1) is complete and live.

- [ ] React Native viewer (read-only board rendering)
- [ ] Light editing (notes, text)

## Deferred / out of scope for v1

Comments, chat, reactions, templates. Export and view-only links, deferred
until now, are proposed in Phase 1.6.
