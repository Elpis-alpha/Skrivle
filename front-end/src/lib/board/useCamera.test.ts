import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createElement } from "./elements";
import { useCamera } from "./useCamera";
import { boardToScreen, createViewportStore, fitRect, type ViewportStore } from "./viewport";

const HOST = { w: 1000, h: 600 };

let doc: Y.Doc;
let store: ViewportStore;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  doc = new Y.Doc();
  store = createViewportStore();
  host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: HOST.w });
  Object.defineProperty(host, "clientHeight", { value: HOST.h });
});

afterEach(() => {
  vi.useRealTimers();
});

const settle = () => act(() => vi.advanceTimersByTime(1000));

function camera(hydrated = true) {
  return renderHook(
    ({ hydrated }) => useCamera({ doc, store, hostRef: { current: host }, hydrated }),
    { initialProps: { hydrated } },
  );
}

describe("useCamera", () => {
  it("zooms in a stop at a time, about the middle of the view", () => {
    const { result } = camera();

    act(() => result.current.zoomIn());
    settle();

    const viewport = store.getSnapshot();
    expect(viewport.scale).toBe(1.25);
    // The board point that was in the middle of the view is still there.
    expect(boardToScreen({ x: 500, y: 300 }, viewport)).toEqual({ x: 500, y: 300 });
  });

  it("steps from where a glide is heading when pressed again mid-glide", () => {
    const { result } = camera();

    act(() => result.current.zoomIn());
    act(() => vi.advanceTimersToNextFrame());
    act(() => result.current.zoomIn());
    settle();

    expect(store.getSnapshot().scale).toBe(1.5);
  });

  it("steps from wherever the user left it after a wheel cut a glide short", () => {
    const { result } = camera();

    act(() => result.current.zoomIn());
    act(() => vi.advanceTimersToNextFrame());
    act(() => store.set({ x: 0, y: 0, scale: 2 }));
    settle();
    act(() => result.current.zoomIn());
    settle();

    expect(store.getSnapshot().scale).toBe(3);
  });

  it("zooms out a stop at a time", () => {
    const { result } = camera();
    act(() => result.current.zoomOut());
    settle();
    expect(store.getSnapshot().scale).toBe(0.75);
  });

  it("goes back to 100% without losing its place", () => {
    store.set({ x: 0, y: 0, scale: 2 });
    const { result } = camera();

    act(() => result.current.resetZoom());
    settle();

    const viewport = store.getSnapshot();
    expect(viewport.scale).toBe(1);
    // The middle of the view stays the middle of the view.
    expect(boardToScreen({ x: 250, y: 150 }, viewport)).toEqual({ x: 500, y: 300 });
  });

  it("fits everything on the board into view", () => {
    createElement(doc, { kind: "rect", x: 3000, y: 2000, w: 400, h: 200 });
    const { result } = camera();

    act(() => result.current.fit());
    settle();

    expect(store.getSnapshot()).toEqual(fitRect({ x: 3000, y: 2000, w: 400, h: 200 }, HOST));
  });

  it("opens a board on its content when none of it is in view", () => {
    createElement(doc, { kind: "rect", x: 3000, y: 2000, w: 400, h: 200 });
    const { rerender } = camera(false);

    rerender({ hydrated: true });

    expect(store.getSnapshot()).toEqual(fitRect({ x: 3000, y: 2000, w: 400, h: 200 }, HOST));
  });

  it("leaves the camera alone on load when something is already in view", () => {
    createElement(doc, { kind: "rect", x: 100, y: 100, w: 400, h: 200 });
    const { rerender } = camera(false);

    rerender({ hydrated: true });

    expect(store.getSnapshot()).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("only fits on load once, not every time the document changes", () => {
    const { rerender } = camera(false);
    rerender({ hydrated: true });

    act(() => {
      createElement(doc, { kind: "rect", x: 3000, y: 2000, w: 400, h: 200 });
    });
    rerender({ hydrated: true });

    expect(store.getSnapshot()).toEqual({ x: 0, y: 0, scale: 1 });
  });
});
