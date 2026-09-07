// Canvas coordinates.
//
// Pan/zoom is local view state and never enters the Yjs doc — put the camera in
// the shared document and every peer's screen fights for it. When pan/zoom
// lands it becomes a useViewport() hook alongside useBoardDoc(), and only these
// two functions change.

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
