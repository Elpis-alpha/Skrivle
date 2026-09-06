# Skrivle — Project Brief

## What it is

A live collaborative whiteboard. Anyone can create a board and start drawing/writing
instantly — no signup required. Share the URL, others join and edit in real time.
Optional sign-in persists boards long-term.

## Why this project exists (context for future me / reviewers)

Portfolio piece built to:

- Demonstrate real-time systems + system design depth (extends prior work on
  delta-update sync and Socket.IO pipelines from a previous role)
- Be testable by a hirer/client in under 10 seconds — no login wall
- Serve as a project built with heavy use of Claude Code, to demonstrate an
  AI-assisted development workflow
- Include genuine auth + DB design, not just a toy demo

## Core user flow

1. Land on `/` → click "New Board" → instantly redirected to `/board/:id`, no
   compulsory login. The id is by default 5 alphanumeric characters, or can be set
   to a unique custom string at creation time (not editable afterwards).
2. Canvas tools: sticky notes, text boxes, basic shapes (rectangle, circle,
   line/arrow), freehand pen.
3. Real-time multiplayer: see other users' live cursors (name + color), see their
   edits appear instantly.
4. Share via URL — anyone with the link joins the same board as a guest.
5. "Sign in to save" (GitHub / Google OAuth) — signed-in users' boards persist and
   appear under "My Boards".
6. Anonymous/guest boards are ephemeral — expire after ~24 hours. The creator can
   extend by +48 hours even without signing in.

## Explicitly out of scope (v1)

- No comments, chat, or reactions
- No templates
- No export (PDF / PNG)
- No granular permission tiers beyond owner / editor
- No mobile app yet (planned as phase 2: React Native viewer / light editor)

## Tech stack

- **Frontend**: React / Next.js, Tailwind CSS
- **Real-time transport**: Socket.IO
- **Conflict-free sync**: Yjs (CRDT) — the live document state
- **Backend**: Node.js / Express
- **Database**: PostgreSQL (users, board metadata, permissions) — Yjs snapshots
  stored as blobs, not modeled relationally
- **Auth**: OAuth (GitHub + Google)
- **Deployment**: Cloudflare (coming-soon + front-end); Docker Compose + Nginx
  (back-end API)

## Success criteria for "done" (v1 demo-ready)

- A stranger can open a shared link and start drawing within 5 seconds, no account
- Two browser tabs on the same board show live sync with no visible lag under
  normal use
- Signing in preserves a board across sessions
- Deployed publicly with a working demo URL
