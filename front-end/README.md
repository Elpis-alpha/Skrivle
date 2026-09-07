# Skrivle — front-end

Next.js (App Router) + TypeScript + Tailwind CSS v4 web client for Skrivle.

See the repo root for context: [`PROJECT_BRIEF.md`](../PROJECT_BRIEF.md),
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md),
[`docs/STYLE_GUIDE.md`](../docs/STYLE_GUIDE.md).

## Commands

```bash
npm run dev        # dev server on http://localhost:3000 (Turbopack)
npm run build      # production build (also type-checks)
npm run start      # serve the production build
npm run lint       # ESLint (flat config)
npm test           # Vitest unit/component tests (run once)
npm run test:watch # Vitest in watch mode
npm run test:e2e   # Playwright end-to-end tests
```

## Talking to the API

`NEXT_PUBLIC_API_URL` points the client at the back-end. It is optional:
[`src/lib/api/config.ts`](src/lib/api/config.ts) falls back to
`http://localhost:4000` in development and `https://api.skrivle.elpis.cc`
otherwise, so a fresh clone works with no `.env` at all.

It is inlined by `next build`, **not** read at runtime — so to point a build at
a different API it must be in the environment of the build command:

```bash
NEXT_PUBLIC_API_URL=https://api-staging.example npm run deploy
```

Putting it in `wrangler.jsonc` `vars` or `.dev.vars` does nothing: those exist
only at Worker runtime, long after the value was baked into the client bundle.

The session is an httpOnly cookie on the API's own origin, so every request
sends `credentials: "include"` and the socket sets `withCredentials`. No proxy
is needed — `localhost:3000`↔`:4000` and `skrivle.elpis.cc`↔`api.skrivle.elpis.cc`
are both *same-site*, so the `SameSite=Lax` cookie rides along.

## End-to-end tests

`npm run test:e2e` starts **both** servers itself — the front-end and a real
back-end on port 4100 — so the suite exercises the actual wire contract: real
sign-in, real board creation, real two-tab cursor sync.

One-time setup, from `back-end/`:

```bash
npm run db:test:setup    # creates and migrates skrivle_test
```

Notes:

- Port 4100, not 4000, and `reuseExistingServer: false` on both servers. A
  back-end already running for development would otherwise be reused silently,
  the test environment ignored, and the suite run against your **development
  database**.
- The e2e back-end uses Redis logical database 1. Reset it with
  `redis-cli -n 1 flushdb` if the per-IP rate limits start biting.
- It runs with `AUTH_DEV_CODES=1`, which returns the sign-in code in the
  `POST /api/auth/email/request` response instead of mailing it — that is how
  the tests sign in without an inbox. It is ignored in production.
- Override the database or Redis with `E2E_DATABASE_URL` / `E2E_REDIS_URL`.

Playwright needs its browser binary once per machine:

```bash
npx playwright install chromium
```

## Deployment (Cloudflare Workers)

Deployed to Cloudflare Workers as `skrivle-web` via
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), live at
[`skrivle.elpis.cc`](https://skrivle.elpis.cc). Config lives in
[`wrangler.jsonc`](wrangler.jsonc) and [`open-next.config.ts`](open-next.config.ts).

```bash
npm run preview     # build with OpenNext + run the Worker locally in workerd
npm run deploy      # build + deploy to Cloudflare (needs `wrangler login`)
npm run cf-typegen  # regenerate cloudflare-env.d.ts after editing wrangler.jsonc
```

`.dev.vars` holds local-only vars for `next dev` / `preview` (gitignored). The
generated `cloudflare-env.d.ts` is gitignored — run `npm run cf-typegen` after a
fresh clone or a `wrangler.jsonc` change.

## Design system

The [`docs/STYLE_GUIDE.md`](../docs/STYLE_GUIDE.md) tokens are the single source
of truth and are wired in here:

| Style guide | Lives in |
| --- | --- |
| §11.1 CSS custom properties (light + dark) | [`src/app/globals.css`](src/app/globals.css) `:root` / `:root[data-theme="dark"]` |
| §11.3 Tailwind config | `src/app/globals.css` `@theme` / `@theme inline` (translated from the v3 JS config to v4 CSS-first) |
| §11.2 cursor + note palettes | [`src/lib/presence-colors.ts`](src/lib/presence-colors.ts) |
| §3 Poppins (400/500/600/700) | `next/font/google` in [`src/app/layout.tsx`](src/app/layout.tsx), fed to `--font-sans` |
| §11.1 explicit theme (no flash) | blocking boot script in `src/app/layout.tsx`, choice persisted to `localStorage["skrivle-theme"]` |

## Layout

| Concern | Lives in |
| --- | --- |
| REST client (one `apiFetch`, hand-written types mirroring `openapi.yaml`) | [`src/lib/api/`](src/lib/api/) |
| Yjs + Socket.IO session, framework-free, and its React binding | [`src/lib/realtime/`](src/lib/realtime/) |
| Who you are (`GET /api/auth/me`, once, per product surface) | [`src/lib/session/`](src/lib/session/) |
| Guest board tokens, claiming, expiry copy | [`src/lib/board/`](src/lib/board/) |

Routes are split into two groups: `(marketing)` depends on no back-end and
stays fully static; `(product)` (`/signin`, `/board/[id]`, `/boards`) sits under
the session provider. Route groups don't affect URLs.

Board data is fetched client-side, not in a server component. The session
cookie is host-only on the API origin, so a Worker rendering `/board/:id` would
never see it and would compute `role: null` for everyone — including owners.
In local development the cookie *would* be readable (same host, different
port), which is exactly the trap: it would work here and break after deploy.

## Not built yet

Still to come (see [`docs/ROADMAP.md`](../docs/ROADMAP.md)):

- Canvas: pan/zoom and the dot grid's zoom response
- Tools: sticky note, text box, rectangle, circle, line/arrow, freehand pen
- Board thumbnails (render + signed Cloudinary upload)
- Share dialog, board rename/delete from `/boards`, tooltips (§10.19)

The Yjs document and its transport are already live, so a tool only has to read
and write the root types in
[`src/lib/realtime/doc-schema.ts`](src/lib/realtime/doc-schema.ts).
