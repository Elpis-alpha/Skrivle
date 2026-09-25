import { afterEach, describe, expect, it, vi } from "vitest";
import { reportBrowserError, reportError } from "./report.js";

afterEach(() => vi.restoreAllMocks());

const TAG = "[skrivle] error ";

/** Start capturing, and return a reader for every report written since. */
function capture() {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  return () => spy.mock.calls.map(([line]) => String(line));
}

const parse = (line: string) => JSON.parse(line.slice(TAG.length)) as Record<string, unknown>;

describe("reportError", () => {
  it("writes an error as one tagged line of JSON, stack and all", () => {
    const lines = capture();
    const err = new Error("boom");

    reportError("socket", err, { boardId: "abcde" });

    expect(lines()).toHaveLength(1);
    const [line] = lines();
    expect(line.startsWith(TAG)).toBe(true);
    expect(line).not.toContain("\n");
    expect(parse(line)).toEqual({
      tier: "api",
      where: "socket",
      message: "boom",
      stack: err.stack,
      boardId: "abcde",
    });
  });

  it("reports a thrown value that isn't an Error", () => {
    const lines = capture();
    reportError("process", "gave up");
    expect(parse(lines()[0])).toEqual({ tier: "api", where: "process", message: "gave up" });
  });
});

describe("reportBrowserError", () => {
  it("tags the report as the browser's, with the browser it came from", () => {
    const lines = capture();

    reportBrowserError(
      { source: "boundary", message: "Maximum update depth exceeded", path: "/board/abcde" },
      "Firefox/140",
    );

    expect(parse(lines()[0])).toEqual({
      tier: "browser",
      source: "boundary",
      message: "Maximum update depth exceeded",
      path: "/board/abcde",
      userAgent: "Firefox/140",
    });
  });

  // A report is written by whoever sent it. Left unescaped, a newline in it
  // would start a line of the sender's own choosing in the server's log.
  it("keeps a report to its own line, whatever it contains", () => {
    const lines = capture();
    reportBrowserError(
      { source: "window", message: "x\n[skrivle] snapshot writer stopped", path: "/" },
      undefined,
    );
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).not.toContain("\n");
  });
});
