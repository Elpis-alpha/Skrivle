import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Next.js runs instrumentation-client.ts before the app hydrates. Here it is
// imported once, and the listeners it adds stay for the rest of this file.
const report = vi.fn();
vi.mock("@/lib/report-error", () => ({ reportError: report }));

beforeAll(async () => {
  await import("./instrumentation-client");
});
afterAll(() => vi.restoreAllMocks());

describe("instrumentation-client", () => {
  it("reports an error nothing caught", () => {
    const error = new Error("thrown from a timer");
    window.dispatchEvent(new ErrorEvent("error", { error, message: error.message }));
    expect(report).toHaveBeenLastCalledWith(error, "window");
  });

  // Another origin's script: the browser withholds the error and says only this.
  it("reports the message when the browser withholds the error itself", () => {
    window.dispatchEvent(new ErrorEvent("error", { message: "Script error." }));
    expect(report).toHaveBeenLastCalledWith("Script error.", "window");
  });

  it("reports a promise rejection nothing handled", () => {
    const reason = new Error("socket gave up");
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason }));
    expect(report).toHaveBeenLastCalledWith(reason, "promise");
  });
});
