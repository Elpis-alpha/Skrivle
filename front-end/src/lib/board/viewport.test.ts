import { afterEach, describe, expect, it, vi } from "vitest";
import {
  animateViewport,
  boardToScreen,
  fitRect,
  clampViewport,
  createViewportStore,
  GRID_SPACING,
  gridOpacity,
  gridStyle,
  IDENTITY,
  MAX_SCALE,
  MIN_SCALE,
  nextZoom,
  panBy,
  screenToBoard,
  visibleRect,
  zoomAt,
} from "./viewport";

describe("screenToBoard / boardToScreen", () => {
  it("round-trips through any camera", () => {
    const viewport = { x: -140, y: 62, scale: 2.5 };
    const point = { x: 37, y: 91 };
    const back = screenToBoard(boardToScreen(point, viewport), viewport);
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
  });
});

describe("clampViewport", () => {
  it("holds the scale inside the zoom limits", () => {
    expect(clampViewport({ x: 0, y: 0, scale: 99 }).scale).toBe(MAX_SCALE);
    expect(clampViewport({ x: 0, y: 0, scale: 0.001 }).scale).toBe(MIN_SCALE);
  });

  // Float precision falls apart past this, and a canvas that silently stops
  // tracking the pointer is horrible to diagnose.
  it("holds the offset inside a range floats can still represent", () => {
    expect(clampViewport({ x: 1e12, y: -1e12, scale: 1 })).toMatchObject({
      x: 1e7,
      y: -1e7,
    });
  });
});

describe("zoomAt", () => {
  // The whole point of zoom-at-pointer.
  it("keeps the board point under the anchor exactly where it was", () => {
    const before = { x: -300, y: 120, scale: 1 };
    const anchor = { x: 400, y: 250 };
    const boardBefore = screenToBoard(anchor, before);

    const after = zoomAt(before, 1.6, anchor);
    const boardAfter = screenToBoard(anchor, after);

    expect(after.scale).toBeCloseTo(1.6);
    expect(boardAfter.x).toBeCloseTo(boardBefore.x);
    expect(boardAfter.y).toBeCloseTo(boardBefore.y);
  });

  it("holds the anchor when zooming out too", () => {
    const before = { x: 80, y: -40, scale: 2 };
    const anchor = { x: 120, y: 90 };
    const boardBefore = screenToBoard(anchor, before);
    const boardAfter = screenToBoard(anchor, zoomAt(before, 0.5, anchor));
    expect(boardAfter.x).toBeCloseTo(boardBefore.x);
    expect(boardAfter.y).toBeCloseTo(boardBefore.y);
  });

  it("stops at the limits", () => {
    expect(zoomAt({ x: 0, y: 0, scale: MAX_SCALE }, 2, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
    expect(zoomAt({ x: 0, y: 0, scale: MIN_SCALE }, 0.5, { x: 0, y: 0 }).scale).toBe(MIN_SCALE);
  });

  it("returns the same camera when already pinned at a limit", () => {
    const pinned = { x: 10, y: 20, scale: MAX_SCALE };
    expect(zoomAt(pinned, 2, { x: 0, y: 0 })).toBe(pinned);
  });
});

describe("panBy", () => {
  it("shifts the camera without touching the scale", () => {
    expect(panBy({ x: 10, y: 10, scale: 2 }, -5, 15)).toEqual({ x: 5, y: 25, scale: 2 });
  });
});

describe("gridOpacity", () => {
  // §4.4 — "full at 100%, fades to 0 below ~40% zoom".
  it("is full at 100% zoom and gone at 40%", () => {
    expect(gridOpacity(1)).toBe(1);
    expect(gridOpacity(0.4)).toBe(0);
  });

  it("ramps between, and never leaves 0..1", () => {
    expect(gridOpacity(0.7)).toBeCloseTo(0.5);
    expect(gridOpacity(0.1)).toBe(0);
    expect(gridOpacity(4)).toBe(1);
  });
});

describe("gridStyle", () => {
  it("scales the 24px spacing with the camera", () => {
    expect(gridStyle({ x: 0, y: 0, scale: 2 }).backgroundSize).toBe(
      `${GRID_SPACING * 2}px ${GRID_SPACING * 2}px`,
    );
  });

  // Raw offsets in the millions accumulate enough float error to make the dots
  // shimmer while panning; the pattern repeats, so take it modulo the spacing.
  it("wraps the offset into one cell", () => {
    const { backgroundPosition } = gridStyle({ x: 1_000_000, y: -7, scale: 1 });
    const [x, y] = backgroundPosition.split(" ").map((n) => parseFloat(n));
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(GRID_SPACING);
    expect(y).toBe(17); // -7 wrapped into 0..24
  });

  it("keeps a negative offset positive", () => {
    const { backgroundPosition } = gridStyle({ x: -1, y: -1, scale: 1 });
    expect(backgroundPosition).toBe("23.000px 23.000px");
  });
});

describe("createViewportStore", () => {
  it("starts at the camera it is given, clamped", () => {
    expect(createViewportStore({ x: 0, y: 0, scale: 100 }).getSnapshot().scale).toBe(MAX_SCALE);
  });

  it("defaults to the identity camera", () => {
    expect(createViewportStore().getSnapshot()).toEqual(IDENTITY);
  });

  it("notifies subscribers on a change", () => {
    const store = createViewportStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ x: 10, y: 0, scale: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("takes an updater function", () => {
    const store = createViewportStore();
    store.set((current) => panBy(current, 5, 5));
    expect(store.getSnapshot()).toMatchObject({ x: 5, y: 5 });
  });

  // useSyncExternalStore compares by identity, so an unchanged camera must not
  // produce a new object or a notification.
  it("stays identical and silent when nothing actually changed", () => {
    const store = createViewportStore({ x: 3, y: 4, scale: 1 });
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ x: 3, y: 4, scale: 1 });

    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying once unsubscribed", () => {
    const store = createViewportStore();
    const listener = vi.fn();
    store.subscribe(listener)();
    store.set({ x: 1, y: 0, scale: 1 });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("fitRect", () => {
  const host = { w: 1000, h: 600 };

  it("centres the content in the view", () => {
    const viewport = fitRect({ x: 100, y: 100, w: 200, h: 100 }, host);
    const centre = boardToScreen({ x: 200, y: 150 }, viewport);
    expect(centre.x).toBeCloseTo(500);
    expect(centre.y).toBeCloseTo(300);
  });

  it("scales big content down until it fits inside the padding", () => {
    const viewport = fitRect({ x: 0, y: 0, w: 4000, h: 1000 }, host, 50);
    expect(viewport.scale).toBeCloseTo(900 / 4000);
  });

  // A lone sticky note filling the screen at 400% is not "fit", it's a jump.
  it("never zooms past 100% for small content", () => {
    expect(fitRect({ x: 0, y: 0, w: 20, h: 20 }, host).scale).toBe(1);
  });

  it("stops at the zoom floor for enormous content", () => {
    expect(fitRect({ x: 0, y: 0, w: 1e6, h: 1e6 }, host).scale).toBe(MIN_SCALE);
  });
});

describe("visibleRect", () => {
  it("is the part of the board the host is showing, in board units", () => {
    expect(visibleRect({ x: -100, y: 50, scale: 2 }, { w: 800, h: 400 })).toEqual({
      x: 50,
      y: -25,
      w: 400,
      h: 200,
    });
  });
});

describe("nextZoom", () => {
  it("steps to the next stop up or down", () => {
    expect(nextZoom(1, 1)).toBe(1.25);
    expect(nextZoom(1, -1)).toBe(0.75);
  });

  it("snaps an in-between zoom to the nearest stop in that direction", () => {
    expect(nextZoom(1.1, 1)).toBe(1.25);
    expect(nextZoom(1.1, -1)).toBe(1);
  });

  it("stays put at either end", () => {
    expect(nextZoom(MAX_SCALE, 1)).toBe(MAX_SCALE);
    expect(nextZoom(MIN_SCALE, -1)).toBe(MIN_SCALE);
  });
});

describe("animateViewport", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("glides the camera to its target and lands on it exactly", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const store = createViewportStore();
    const target = { x: 300, y: -120, scale: 2 };

    animateViewport(store, target, 200);
    vi.advanceTimersToNextFrame();
    const midway = store.getSnapshot();
    expect(midway.scale).toBeGreaterThan(1);
    expect(midway.scale).toBeLessThan(2);

    vi.advanceTimersByTime(250);
    expect(store.getSnapshot()).toEqual(target);
  });

  it("gives way the moment someone moves the camera themselves", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const store = createViewportStore();

    const stop = animateViewport(store, { x: 300, y: 0, scale: 2 }, 200);
    vi.advanceTimersToNextFrame();
    stop();
    const stopped = store.getSnapshot();
    vi.advanceTimersByTime(250);

    expect(store.getSnapshot()).toEqual(stopped);
  });

  it("yields to a wheel or pan that lands mid-glide", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const store = createViewportStore();

    animateViewport(store, { x: 300, y: 0, scale: 2 }, 200);
    vi.advanceTimersToNextFrame();
    store.set({ x: -50, y: -50, scale: 0.5 });
    vi.advanceTimersByTime(250);

    expect(store.getSnapshot()).toEqual({ x: -50, y: -50, scale: 0.5 });
  });
});
