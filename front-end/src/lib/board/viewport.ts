// Canvas coordinates and the camera.
//
// Pan/zoom is local view state and never enters the Yjs doc — put the camera in
// the shared document and every peer's screen fights for it.
//
// The camera is an external store rather than React state, and CameraLayer
// writes the transform straight onto the DOM from a rAF. Holding {x, y, scale}
// in useState would reconcile every element on the board on every wheel tick;
// only the zoom readout actually needs to re-render when the camera moves.

import type { Rect } from "./geometry";

export type Point = { x: number; y: number };
export type Viewport = { x: number; y: number; scale: number };

export const IDENTITY: Viewport = { x: 0, y: 0, scale: 1 };

/** Canvas-relative pixels to board coordinates. Identity until pan/zoom lands. */
export function screenToBoard(
  point: { x: number; y: number },
  viewport: Viewport = IDENTITY,
): { x: number; y: number } {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  };
}

/** Board coordinates back to canvas-relative pixels. */
export function boardToScreen(
  point: { x: number; y: number },
  viewport: Viewport = IDENTITY,
): { x: number; y: number } {
  return {
    x: point.x * viewport.scale + viewport.x,
    y: point.y * viewport.scale + viewport.y,
  };
}

/**
 * Zoom limits. The floor is below §4.4's "fades to 0 below ~40% zoom", which
 * only makes sense if you can get there.
 */
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 4;

/**
 * How far the camera may travel, in screen pixels of offset.
 *
 * Not a boundary on the board — it is unbounded — but float precision degrades
 * badly past this, and a canvas that quietly stops tracking the pointer is a
 * horrible bug to diagnose.
 */
const MAX_OFFSET = 1e7;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function clampViewport(viewport: Viewport): Viewport {
  return {
    x: clamp(viewport.x, -MAX_OFFSET, MAX_OFFSET),
    y: clamp(viewport.y, -MAX_OFFSET, MAX_OFFSET),
    scale: clamp(viewport.scale, MIN_SCALE, MAX_SCALE),
  };
}

/**
 * Scale about a fixed point, so whatever is under the pointer stays under it.
 *
 * `anchor` is canvas-relative screen pixels — the same space `screenToBoard`
 * takes.
 */
export function zoomAt(viewport: Viewport, factor: number, anchor: Point): Viewport {
  const scale = clamp(viewport.scale * factor, MIN_SCALE, MAX_SCALE);

  // Nothing to do if we were already against a limit; recomputing the offset
  // from an unchanged scale would still be correct, but this keeps it exact.
  if (scale === viewport.scale) return viewport;

  const board = screenToBoard(anchor, viewport);
  return clampViewport({
    x: anchor.x - board.x * scale,
    y: anchor.y - board.y * scale,
    scale,
  });
}

/**
 * Zoom to an exact `scale` about a fixed point. zoomAt's multiply-a-factor
 * form drifts (0.75 × 4/3 is not quite 1); the zoom buttons need to land on
 * their stops exactly, so the readout says 100% rather than 99.99…%.
 */
export function zoomTo(viewport: Viewport, scale: number, anchor: Point): Viewport {
  const target = clamp(scale, MIN_SCALE, MAX_SCALE);
  const board = screenToBoard(anchor, viewport);
  return clampViewport({
    x: anchor.x - board.x * target,
    y: anchor.y - board.y * target,
    scale: target,
  });
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return clampViewport({ ...viewport, x: viewport.x + dx, y: viewport.y + dy });
}

/** A host element's size, in screen pixels. */
export type Size = { w: number; h: number };

/**
 * The camera that shows all of `content`, centred, with `padding` screen
 * pixels clear on every side.
 *
 * Never past 100%: fitting one sticky note should show it at its real size,
 * not blow it up to fill the screen.
 */
export function fitRect(content: Rect, host: Size, padding = 80): Viewport {
  const room = { w: Math.max(host.w - padding * 2, 1), h: Math.max(host.h - padding * 2, 1) };
  const scale = clamp(
    Math.min(room.w / Math.max(content.w, 1), room.h / Math.max(content.h, 1), 1),
    MIN_SCALE,
    MAX_SCALE,
  );
  return clampViewport({
    x: host.w / 2 - (content.x + content.w / 2) * scale,
    y: host.h / 2 - (content.y + content.h / 2) * scale,
    scale,
  });
}

/** The part of the board a host of this size is showing, in board units. */
export function visibleRect(viewport: Viewport, host: Size): Rect {
  const topLeft = screenToBoard({ x: 0, y: 0 }, viewport);
  return { x: topLeft.x, y: topLeft.y, w: host.w / viewport.scale, h: host.h / viewport.scale };
}

/** Where the zoom buttons and keys stop. 100% is always one of them. */
export const ZOOM_STOPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

/**
 * The next stop up (1) or down (-1) from `scale`. A zoom that wheel or pinch
 * left between stops goes to the nearest one in that direction, so one press
 * always lands somewhere round.
 */
export function nextZoom(scale: number, direction: 1 | -1): number {
  const EPSILON = 1e-6;
  if (direction === 1) {
    return ZOOM_STOPS.find((stop) => stop > scale + EPSILON) ?? MAX_SCALE;
  }
  return [...ZOOM_STOPS].reverse().find((stop) => stop < scale - EPSILON) ?? MIN_SCALE;
}

/**
 * Glide the camera to `target` over `ms`, and return a function that stops it.
 *
 * Only ever for something the user asked for — a zoom button, fit — never on
 * its own (§1). It gives way the moment anything else moves the camera, so a
 * wheel or pan mid-glide is never fought.
 *
 * Scale moves geometrically, so a zoom from 25% to 400% spends as long in each
 * doubling rather than rushing through the small end.
 */
export function animateViewport(
  store: ViewportStore,
  target: Viewport,
  ms: number,
  /** Called once the glide lands, or gives way to someone else's move. */
  onEnd?: () => void,
): () => void {
  const from = store.getSnapshot();
  const start = performance.now();
  let frame = 0;
  let expected = from;

  const tick = (now: number) => {
    // Someone else moved the camera since our last frame: theirs wins.
    if (store.getSnapshot() !== expected) {
      onEnd?.();
      return;
    }

    const t = Math.min(1, (now - start) / ms);
    // Close to --ease-standard, cubic-bezier(.2,0,0,1): fast out, long settle.
    const eased = 1 - (1 - t) ** 4;
    const next =
      t === 1
        ? target
        : {
            x: from.x + (target.x - from.x) * eased,
            y: from.y + (target.y - from.y) * eased,
            scale: from.scale * (target.scale / from.scale) ** eased,
          };

    store.set(next);
    expected = store.getSnapshot();
    if (t < 1) frame = requestAnimationFrame(tick);
    else onEnd?.();
  };

  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/**
 * §4.4 — dots at 24px, "opacity scales with zoom: full at 100%, fades to 0
 * below ~40% zoom".
 */
export const GRID_SPACING = 24;

export function gridOpacity(scale: number): number {
  return clamp((scale - 0.4) / 0.6, 0, 1);
}

/**
 * The grid's background-size and -position for a given camera.
 *
 * The offset is taken modulo the spacing rather than used raw: the pattern
 * repeats anyway, and a background-position in the millions accumulates enough
 * float error to make the dots shimmer as you pan.
 */
export function gridStyle(viewport: Viewport): {
  backgroundSize: string;
  backgroundPosition: string;
  opacity: string;
} {
  const spacing = GRID_SPACING * viewport.scale;
  const wrap = (n: number) => (((n % spacing) + spacing) % spacing).toFixed(3);
  return {
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: `${wrap(viewport.x)}px ${wrap(viewport.y)}px`,
    opacity: gridOpacity(viewport.scale).toFixed(3),
  };
}

export type ViewportStore = {
  /** Notified on every change. Subscribers are expected to coalesce with rAF. */
  subscribe: (listener: () => void) => () => void;
  /** Cached and identity-stable between changes, so useSyncExternalStore is safe. */
  getSnapshot: () => Viewport;
  set: (next: Viewport | ((current: Viewport) => Viewport)) => void;
};

export function createViewportStore(initial: Viewport = IDENTITY): ViewportStore {
  let viewport = clampViewport(initial);
  const listeners = new Set<() => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getSnapshot: () => viewport,
    set(next) {
      const resolved = clampViewport(
        typeof next === "function" ? next(viewport) : next,
      );
      if (
        resolved.x === viewport.x &&
        resolved.y === viewport.y &&
        resolved.scale === viewport.scale
      ) {
        return;
      }
      viewport = resolved;
      for (const listener of listeners) listener();
    },
  };
}
