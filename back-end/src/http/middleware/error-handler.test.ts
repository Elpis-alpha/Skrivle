import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "./error-handler.js";

afterEach(() => vi.restoreAllMocks());

const TAG = "[skrivle] error ";

describe("errorHandler", () => {
  it("answers in the error envelope and reports what broke, and where", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = express();
    app.get("/api/boards/:id", () => {
      throw new Error("boom");
    });
    app.use(errorHandler);

    const res = await request(app).get("/api/boards/abcde?x=1");

    expect(res.status).toBe(500);
    expect(res.body.error.next).toBeTruthy();
    const reports = log.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.startsWith(TAG))
      .map((line) => JSON.parse(line.slice(TAG.length)));
    expect(reports).toEqual([
      {
        tier: "api",
        where: "http",
        message: "boom",
        stack: expect.stringContaining("boom"),
        method: "GET",
        path: "/api/boards/abcde",
      },
    ]);
  });
});
