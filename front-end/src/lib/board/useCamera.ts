"use client";

// What the zoom control, the zoom keys and the board's first load do to the
// camera. Everything here is something the user asked for, so it may glide
// (§1 allows motion in direct response to an action); it jumps instead under
// prefers-reduced-motion.

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import type * as Y from "yjs";
import { contentBounds } from "./elements";
import { rectsIntersect } from "./geometry";
import {
  animateViewport,
  fitRect,
  IDENTITY,
  nextZoom,
  visibleRect,
  zoomTo,
  type Size,
  type Viewport,
  type ViewportStore,
} from "./viewport";

/** §7 --dur-slow: a camera move is a big change, but a quick one. */
const GLIDE_MS = 280;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export type CameraActions = {
  zoomIn: () => void;
  zoomOut: () => void;
  /** Back to 100%, keeping the middle of the view where it is. */
  resetZoom: () => void;
  /** Everything on the board, in view. */
  fit: () => void;
};

export function useCamera({
  doc,
  store,
  hostRef,
  hydrated,
}: {
  doc: Y.Doc | null;
  store: ViewportStore;
  hostRef: RefObject<HTMLElement | null>;
  /** The §7 settle signal: the document has arrived and can be measured. */
  hydrated: boolean;
}): CameraActions {
  const stopGlide = useRef<(() => void) | null>(null);
  // Where a glide in flight is heading. A second press mid-glide steps on from
  // here: stepping from the camera's in-between scale would land on the stop
  // the first press is already heading for, and the zoom would stall.
  const heading = useRef<Viewport | null>(null);

  const hostSize = useCallback((): Size | null => {
    const host = hostRef.current;
    return host ? { w: host.clientWidth, h: host.clientHeight } : null;
  }, [hostRef]);

  const moveTo = useCallback(
    (target: Viewport) => {
      stopGlide.current?.();
      if (reducedMotion()) {
        store.set(target);
        return;
      }
      heading.current = target;
      stopGlide.current = animateViewport(store, target, GLIDE_MS, () => {
        heading.current = null;
      });
    },
    [store],
  );

  const zoomAboutMiddle = useCallback(
    (scale: (current: number) => number) => {
      const size = hostSize();
      if (!size) return;
      const from = heading.current ?? store.getSnapshot();
      moveTo(zoomTo(from, scale(from.scale), { x: size.w / 2, y: size.h / 2 }));
    },
    [hostSize, moveTo, store],
  );

  const zoomIn = useCallback(() => zoomAboutMiddle((s) => nextZoom(s, 1)), [zoomAboutMiddle]);
  const zoomOut = useCallback(() => zoomAboutMiddle((s) => nextZoom(s, -1)), [zoomAboutMiddle]);
  const resetZoom = useCallback(() => zoomAboutMiddle(() => 1), [zoomAboutMiddle]);

  const fit = useCallback(() => {
    const size = hostSize();
    if (!size || !doc) return;
    const bounds = contentBounds(doc);
    // An empty board has nothing to fit; the origin is where a new one starts.
    moveTo(bounds ? fitRect(bounds, size) : IDENTITY);
  }, [doc, hostSize, moveTo]);

  // A shared link should open on the work, not on empty paper. The camera
  // starts at the origin, so a board whose content lives anywhere else would
  // look blank to the person who was just sent it. Once, when the document
  // first arrives, and only if nothing is already in view — a board that opens
  // fine is left exactly as it opens. A jump, not a glide: it happens before
  // the §7 settle has shown anything.
  const fittedOnLoad = useRef(false);
  useEffect(() => {
    if (!hydrated || !doc || fittedOnLoad.current) return;
    fittedOnLoad.current = true;

    const size = hostSize();
    const bounds = contentBounds(doc);
    if (!size || !bounds) return;
    if (rectsIntersect(bounds, visibleRect(store.getSnapshot(), size))) return;
    store.set(fitRect(bounds, size));
  }, [hydrated, doc, hostSize, store]);

  useEffect(() => () => stopGlide.current?.(), []);

  return useMemo(() => ({ zoomIn, zoomOut, resetZoom, fit }), [zoomIn, zoomOut, resetZoom, fit]);
}
