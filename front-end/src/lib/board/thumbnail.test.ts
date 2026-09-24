import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { appendPoints, createElement } from "./elements";
import { strokeOutline } from "./stroke";
import { renderThumbnail } from "./thumbnail";

// jsdom has no 2D context and no Path2D, so record what the renderer asks a
// context to do instead. Every method is a no-op that notes its call.
function recordingContext() {
  const calls: { name: string; args: unknown[] }[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_target, key) => (...args: unknown[]) => {
        calls.push({ name: String(key), args });
        return { width: 0 };
      },
      set: () => true,
    },
  );
  return { ctx, calls };
}

class FakePath2D {
  constructor(public d: string) {}
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("renderThumbnail", () => {
  it("fills a stroke's tapered outline, the same ink the board shows", () => {
    const { ctx, calls } = recordingContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    vi.stubGlobal("Path2D", FakePath2D);

    const doc = new Y.Doc();
    const id = createElement(doc, {
      kind: "path",
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      strokeWidth: 4,
      points: [0, 0],
    });
    appendPoints(doc, id, [20, 10, 40, 0]);

    renderThumbnail(doc);

    const fills = calls.filter((call) => call.name === "fill");
    expect(fills.map((call) => (call.args[0] as FakePath2D | undefined)?.d)).toContain(
      strokeOutline([0, 0, 20, 10, 40, 0], 4),
    );
    expect(calls.some((call) => call.name === "stroke" && call.args[0] instanceof FakePath2D)).toBe(
      false,
    );
  });
});
