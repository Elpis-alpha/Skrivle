import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { createServer } = await import("../../server.js");
const { RULES } = await import("../../redis/rate-limit.js");
const { flushTestKeys, useRedis } = await import("../../test/redis-harness.js");

useRedis();
const { app } = createServer();

beforeEach(async () => {
  await flushTestKeys("rl:*");
});
afterEach(() => vi.restoreAllMocks());

const TAG = "[skrivle] error ";

/** Start capturing, and return a reader for the error reports written since. */
function captureReports() {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  return () =>
    spy.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.startsWith(TAG))
      .map((line) => JSON.parse(line.slice(TAG.length)) as Record<string, unknown>);
}

const crash = {
  source: "boundary",
  message: "Minified React error #185",
  stack: "Error: Minified React error #185\n    at TextEditor",
  path: "/board/abcde",
};

describe("POST /api/errors", () => {
  it("logs a browser's report and answers with no content", async () => {
    const reports = captureReports();

    const res = await request(app).post("/api/errors").set("User-Agent", "Firefox/140").send(crash);

    expect(res.status).toBe(204);
    expect(reports()).toEqual([{ tier: "browser", ...crash, userAgent: "Firefox/140" }]);
  });

  it("refuses something that isn't a report, and logs nothing", async () => {
    const reports = captureReports();

    const res = await request(app).post("/api/errors").send({ source: "boundary", path: "/" });

    expect(res.status).toBe(400);
    expect(reports()).toEqual([]);
  });

  it("refuses a report longer than any real one", async () => {
    const reports = captureReports();

    const res = await request(app)
      .post("/api/errors")
      .send({ ...crash, stack: "x".repeat(20_000) });

    expect(res.status).toBe(400);
    expect(reports()).toEqual([]);
  });

  // Anyone can post here, and every accepted report is a line in the log.
  it("stops taking reports from one address past its limit", async () => {
    captureReports();
    for (let i = 0; i < RULES.errorReportPerIp.limit; i++) {
      const ok = await request(app).post("/api/errors").send(crash);
      expect(ok.status).toBe(204);
    }

    const res = await request(app).post("/api/errors").send(crash);
    expect(res.status).toBe(429);
  });
});
