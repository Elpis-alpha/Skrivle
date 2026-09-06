# comming-soon

Static holding page served at the domain root until `front-end/` is
demo-ready (see [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) —
Deployment). Nginx serves `index.html` at `/`; once the web client ships,
the root proxies to `front-end/` instead.

Intentionally **build-free**: a single `index.html` with an inline `<style>`
block, per [../docs/STYLE_GUIDE.md](../docs/STYLE_GUIDE.md) §11.4. No
`package.json`, no bundler, no dependencies. Poppins loads from Google Fonts;
light/dark follows the visitor's OS setting via `prefers-color-scheme`.

To preview, open `index.html` in a browser.
