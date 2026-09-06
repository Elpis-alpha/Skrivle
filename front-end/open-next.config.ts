import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal config: the site is almost entirely static / server-rendered with no
// ISR yet, so no incremental cache override is wired up. Add an R2 or KV cache
// override here (see https://opennext.js.org/cloudflare/caching) once routes
// start using `revalidate` / `use cache`.
export default defineCloudflareConfig({});
