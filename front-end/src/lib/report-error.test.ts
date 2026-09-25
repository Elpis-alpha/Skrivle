import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Init = { method?: string; body?: string };

let fetchSpy: ReturnType<typeof vi.fn<(url: string, init: Init) => Promise<Response>>>;
let reportError: typeof import("./report-error").reportError;

// The module remembers what it has sent for the life of the page, so each test
// gets a fresh page.
beforeEach(async () => {
  vi.resetModules();
  fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal("fetch", fetchSpy);
  ({ reportError } = await import("./report-error"));
});
afterEach(() => vi.unstubAllGlobals());

const sent = () =>
  fetchSpy.mock.calls.map(([url, init]) => ({
    path: new URL(url).pathname,
    method: init.method,
    body: JSON.parse(init.body!),
  }));

describe("reportError", () => {
  it("posts the error, with the page it happened on, to the API", () => {
    window.history.replaceState(null, "", "/board/abcde?claim=1#x");
    const err = new Error("Maximum update depth exceeded");

    reportError(err, "boundary");

    expect(sent()).toEqual([
      {
        path: "/api/errors",
        method: "POST",
        body: {
          source: "boundary",
          message: "Maximum update depth exceeded",
          stack: err.stack,
          path: "/board/abcde",
        },
      },
    ]);
  });

  it("names the kind of error when it isn't a plain Error", () => {
    reportError(new TypeError("x is undefined"), "window");
    expect(sent()[0].body.message).toBe("TypeError: x is undefined");
  });

  it("passes on the digest Next.js gives an error from the server", () => {
    reportError(Object.assign(new Error("render failed"), { digest: "123456" }), "boundary");
    expect(sent()[0].body.digest).toBe("123456");
  });

  it("reports something thrown that isn't an Error", () => {
    reportError("gave up", "promise");
    expect(sent()[0].body).toMatchObject({ source: "promise", message: "gave up" });
    expect(sent()[0].body).not.toHaveProperty("stack");
  });

  it("trims a report to what the API accepts", () => {
    const err = new Error("m".repeat(5000));
    err.stack = "s".repeat(50_000);
    reportError(err, "window");
    expect(sent()[0].body.message).toHaveLength(1000);
    expect(sent()[0].body.stack).toHaveLength(8000);
  });

  // A render loop throws the same error for as long as it runs.
  it("sends the same error once", () => {
    const err = new Error("again");
    reportError(err, "window");
    reportError(err, "window");
    expect(sent()).toHaveLength(1);
  });

  it("sends no more than ten from one page", () => {
    for (let i = 0; i < 25; i++) reportError(new Error(`error ${i}`), "window");
    expect(sent()).toHaveLength(10);
  });

  // "Script error." is all a browser says about another origin's script, and a
  // visitor's extensions throw into our page too. Neither is ours to fix.
  it("leaves out errors that carry nothing to act on", () => {
    reportError("Script error.", "window");
    const fromExtension = new Error("boom");
    fromExtension.stack = "Error: boom\n    at chrome-extension://abc/content.js:1:1";
    reportError(fromExtension, "window");
    expect(sent()).toEqual([]);
  });

  it("never throws, even when the report can't be sent", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(() => reportError(new Error("offline"), "window")).not.toThrow();
    await Promise.resolve();
  });
});
