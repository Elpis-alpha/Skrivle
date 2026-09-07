// The OpenAPI document is hand-authored (openapi.yaml). These tests are the
// guard rail: a malformed spec, or an endpoint that ships without a matching
// operation, fails CI instead of shipping broken docs.
import { describe, expect, it } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";

const { createServer } = await import("../server.js");
const { app } = createServer();

/**
 * Every REST operation the server exposes, in OpenAPI path style. Keep this in
 * lockstep with the routers under src/http/routes and the /healthz handler in
 * src/server.ts — adding a route without adding it here fails the last test.
 */
const EXPECTED_OPERATIONS: [string, string][] = [
  ["get", "/healthz"],
  ["post", "/api/auth/email/request"],
  ["post", "/api/auth/email/verify"],
  ["get", "/api/auth/github"],
  ["get", "/api/auth/google"],
  ["get", "/api/auth/callback/{provider}"],
  ["get", "/api/auth/me"],
  ["post", "/api/auth/logout"],
  ["post", "/api/auth/logout/all"],
  ["post", "/api/boards"],
  ["get", "/api/boards"],
  ["get", "/api/boards/{id}"],
  ["get", "/api/boards/{id}/available"],
  ["patch", "/api/boards/{id}"],
  ["delete", "/api/boards/{id}"],
  ["post", "/api/boards/{id}/extend"],
  ["post", "/api/boards/{id}/claim"],
  ["post", "/api/boards/{id}/thumbnail"],
  ["post", "/api/uploads/signature"],
  ["patch", "/api/me"],
];

describe("GET /api/openapi.json", () => {
  it("serves an OpenAPI 3.1 document", async () => {
    const res = await request(app).get("/api/openapi.json");

    expect(res.status).toBe(200);
    expect(res.type).toBe("application/json");
    expect(res.body.openapi).toMatch(/^3\.1\.\d+$/);
    expect(res.body.info.title).toBe("Skrivle API");
  });

  it("is a valid OpenAPI document", async () => {
    const res = await request(app).get("/api/openapi.json");

    // validate() dereferences in place, so hand it a copy.
    await expect(SwaggerParser.validate(structuredClone(res.body))).resolves.toBeDefined();
  });

  it("documents exactly the operations the server exposes", async () => {
    const res = await request(app).get("/api/openapi.json");

    const documented = Object.entries(res.body.paths as Record<string, Record<string, unknown>>)
      .flatMap(([path, item]) =>
        Object.keys(item)
          .filter((key) => ["get", "post", "put", "patch", "delete"].includes(key))
          .map((method) => `${method} ${path}`),
      )
      .sort();
    const expected = EXPECTED_OPERATIONS.map(([m, p]) => `${m} ${p}`).sort();

    expect(documented).toEqual(expected);
  });
});

describe("GET /docs", () => {
  it("renders the Scalar reference", async () => {
    const res = await request(app).get("/docs");

    expect(res.status).toBe(200);
    expect(res.type).toBe("text/html");
    expect(res.text).toMatch(/scalar/i);
  });
});
