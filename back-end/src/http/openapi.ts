// API documentation: a hand-authored OpenAPI 3.1 document (../../openapi.yaml)
// served as JSON at /api/openapi.json, and rendered by Scalar at /docs.
//
// The spec is hand-written rather than generated: the Zod schemas in
// src/http/routes cover request input only, response bodies are assembled
// ad hoc, and the surface is small and stable. src/http/openapi.test.ts keeps
// the document valid and in step with the routes.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import { apiReference } from "@scalar/express-api-reference";
import { parse } from "yaml";

const SPEC_PATH = fileURLToPath(new URL("../../openapi.yaml", import.meta.url));

/**
 * The parsed OpenAPI document. Parsed once at load; a malformed spec throws
 * here and takes the process down, matching the fail-loud stance in
 * config/env.ts.
 */
export const openapiDocument: Record<string, unknown> = parse(readFileSync(SPEC_PATH, "utf8"));

// Poppins + amethyst accent, so the reference matches docs/STYLE_GUIDE.md.
const BRAND_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap');
:root {
  --scalar-font: 'Poppins', ui-sans-serif, system-ui, sans-serif;
  --scalar-color-accent: #32174D;
}
`;

/** Mount /api/openapi.json and /docs. Call before the /api router and 404 handler. */
export function mountDocs(app: Express): void {
  app.get("/api/openapi.json", (_req, res) => {
    res.json(openapiDocument);
  });

  app.get(
    "/docs",
    apiReference({
      content: openapiDocument,
      pageTitle: "Skrivle API",
      theme: "purple",
      hideModels: false,
      customCss: BRAND_CSS,
    }),
  );
}
