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

## Not built yet

Scaffold only. Still to come (see [`docs/ROADMAP.md`](../docs/ROADMAP.md)):

- Landing page (STYLE_GUIDE §4.1), `/board/[id]`, `/boards`
- Canvas: pan/zoom, dot grid, the settle animation
- Tools: sticky note, text box, rectangle, circle, line/arrow, freehand pen
- Yjs document + Socket.IO client, live cursors via Yjs awareness
- OAuth sign-in (GitHub + Google), guest-board claiming, roles
- UI primitives (Button, IconButton, Input, Dialog, Toast, …)
