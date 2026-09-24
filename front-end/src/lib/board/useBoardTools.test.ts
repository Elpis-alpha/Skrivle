import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { PUBLISH_MS } from "@/lib/realtime/board-session";
import { elements } from "@/lib/realtime/doc-schema";
import { createElement, orderedIds, pointsOf, readElement } from "./elements";
import { createPreviewStore, type PreviewStore } from "./preview";
import { DEFAULT_STYLE } from "./tools";
import { strokeOutline } from "./stroke";
import { beginDrawOut, beginMove, beginResize, beginStroke } from "./useBoardTools";

let doc: Y.Doc;
let preview: PreviewStore;
const dispatch = () => {};
const event = {} as PointerEvent;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
  });
  doc = new Y.Doc();
  preview = createPreviewStore();
});

afterEach(() => {
  vi.useRealTimers();
});

const only = () => {
  const [id] = orderedIds(doc);
  return { id, el: readElement(id, elements(doc).get(id)!) };
};

describe("beginDrawOut", () => {
  it("publishes where a line's end is now, not where it was when the timer armed", () => {
    const handlers = beginDrawOut(doc, { x: 0, y: 0 }, "line", DEFAULT_STYLE, dispatch, preview);

    handlers.move({ x: 10, y: 10 }, []);
    handlers.move({ x: 40, y: 20 }, []);
    vi.advanceTimersByTime(PUBLISH_MS);

    const { el } = only();
    expect({ w: el.w, h: el.h }).toEqual({ w: 40, h: 20 });
  });

  it("previews the box every frame, before the document catches up", () => {
    const handlers = beginDrawOut(doc, { x: 0, y: 0 }, "rect", DEFAULT_STYLE, dispatch, preview);

    handlers.move({ x: 30, y: 20 }, []);
    vi.advanceTimersToNextFrame();

    const { id, el } = only();
    expect(preview.get(id)).toEqual({ x: 0, y: 0, w: 30, h: 20 });
    expect(el.w).toBe(0);
  });

  it("previews a line as a delta from its start, the way the document stores it", () => {
    const handlers = beginDrawOut(doc, { x: 50, y: 50 }, "line", DEFAULT_STYLE, dispatch, preview);

    handlers.move({ x: 20, y: 10 }, []);
    vi.advanceTimersToNextFrame();

    expect(preview.get(only().id)).toEqual({ x: 50, y: 50, w: -30, h: -40 });
  });

  it("hands over from the preview to the document when the drag ends", () => {
    const handlers = beginDrawOut(doc, { x: 0, y: 0 }, "rect", DEFAULT_STYLE, dispatch, preview);

    handlers.move({ x: 30, y: 20 }, []);
    vi.advanceTimersToNextFrame();
    handlers.end({ x: 30, y: 20 }, event);

    const { id, el } = only();
    expect(preview.get(id)).toBeNull();
    expect({ w: el.w, h: el.h }).toEqual({ w: 30, h: 20 });
  });
});

describe("beginResize", () => {
  const setup = () => {
    const id = createElement(doc, { kind: "rect", x: 0, y: 0, w: 100, h: 100 });
    const all = [readElement(id, elements(doc).get(id)!)];
    return { id, handlers: beginResize(doc, id, "se", all, preview)! };
  };

  it("previews the new size every frame, before the document catches up", () => {
    const { id, handlers } = setup();

    handlers.move({ x: 150, y: 120 }, []);
    vi.advanceTimersToNextFrame();

    expect(preview.get(id)).toEqual({ x: 0, y: 0, w: 150, h: 120 });
    expect(readElement(id, elements(doc).get(id)!).w).toBe(100);
  });

  it("clears the preview and keeps the result when the drag ends", () => {
    const { id, handlers } = setup();

    handlers.move({ x: 150, y: 120 }, []);
    vi.advanceTimersToNextFrame();
    handlers.end({ x: 150, y: 120 }, event);

    expect(preview.get(id)).toBeNull();
    expect(readElement(id, elements(doc).get(id)!).w).toBe(150);
  });

  it("clears the preview and restores the original when the drag is cancelled", () => {
    const { id, handlers } = setup();

    handlers.move({ x: 150, y: 120 }, []);
    vi.advanceTimersToNextFrame();
    handlers.cancel?.();

    expect(preview.get(id)).toBeNull();
    expect(readElement(id, elements(doc).get(id)!).w).toBe(100);
  });
});

describe("beginMove", () => {
  it("carries the selection outline along with the element every frame", () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<div data-testid="board-element" data-element-id="a"></div>' +
      '<div data-testid="board-selection" data-element-id="a"></div>';
    const handlers = beginMove(doc, ["a"], { x: 0, y: 0 }, host, () => {});

    handlers.move({ x: 12, y: 7 }, []);
    vi.advanceTimersToNextFrame();

    const transforms = [...host.querySelectorAll<HTMLElement>("[data-element-id]")].map(
      (node) => node.style.transform,
    );
    expect(transforms).toEqual(["translate(12px, 7px)", "translate(12px, 7px)"]);
  });
});

describe("beginStroke", () => {
  const style = { ...DEFAULT_STYLE, strokeWidth: 4 as const };

  /** The element's ink, as ElementView would have rendered it by now. */
  const mountInk = (host: HTMLElement, id: string) => {
    host.innerHTML = `<div data-testid="board-element" data-element-id="${id}"><svg><g><path></path></g></svg></div>`;
    return host.querySelector("path")!;
  };

  it("paints the ink under the pointer every frame, before the document catches up", () => {
    const host = document.createElement("div");
    const handlers = beginStroke(doc, { x: 100, y: 100 }, style, dispatch, host);
    const { id } = only();
    const ink = mountInk(host, id);

    handlers.move({ x: 110, y: 105 }, [
      { x: 105, y: 102 },
      { x: 110, y: 105 },
    ]);
    vi.advanceTimersToNextFrame();

    expect(ink.getAttribute("d")).toBe(strokeOutline([0, 0, 5, 2, 10, 5], 4));
    expect(pointsOf(elements(doc).get(id)!)?.length).toBe(2);
  });

  it("keeps painting everything drawn so far once some of it has been published", () => {
    const host = document.createElement("div");
    const handlers = beginStroke(doc, { x: 0, y: 0 }, style, dispatch, host);
    const ink = mountInk(host, only().id);

    handlers.move({ x: 5, y: 2 }, [{ x: 5, y: 2 }]);
    vi.advanceTimersByTime(PUBLISH_MS);
    handlers.move({ x: 10, y: 5 }, [{ x: 10, y: 5 }]);
    vi.advanceTimersToNextFrame();

    expect(ink.getAttribute("d")).toBe(strokeOutline([0, 0, 5, 2, 10, 5], 4));
  });
});
