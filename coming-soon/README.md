# coming-soon

Static holding page, hosted on Cloudflare (see
[../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — Deployment). Live at
`soon.skrivle.elpis.cc` — the `front-end/` now holds the apex `skrivle.elpis.cc`.

Intentionally **build-free**: a single `index.html` with an inline `<style>`
block, per [../docs/STYLE_GUIDE.md](../docs/STYLE_GUIDE.md) §11.4. No
`package.json`, no bundler, no dependencies. Poppins loads from Google Fonts;
light/dark follows the visitor's OS setting via `prefers-color-scheme`.

`logo.svg` is the Skrivle mark — a single-stroke pen loop with an accent tail
(ink loop + `--accent` flick), also inlined in the page as the wordmark lockup
and used as the theme-aware favicon.

To preview, open `index.html` in a browser.
