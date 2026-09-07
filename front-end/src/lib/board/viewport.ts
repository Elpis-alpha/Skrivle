// Canvas coordinates and the camera.
//
// Pan/zoom is local view state and never enters the Yjs doc — put the camera in
// the shared document and every peer's screen fights for it.
//
// The camera is an external store rather than React state, and CameraLayer
// writes the transform straight onto the DOM from a rAF. Holding {x, y, scale}
// in useState would reconcile every element on the board on every wheel tick;
// only the zoom readout actually needs to re-render when the camera moves.

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

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return clampViewport({ ...viewport, x: viewport.x + dx, y: viewport.y + dy });
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
