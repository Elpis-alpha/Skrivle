"use client";

// The camera.
//
// Everything on the board lives inside this one transformed element, so panning
// and zooming is a single composited transform rather than N pieces of maths.
//
// The transform is written straight onto the DOM from a rAF, never through
// React state. Two reasons, and the second is the one that matters: reconciling
// every element on the board on every wheel tick is the obvious jank, but the
// subtle failure is that remote cursors interpolate in their own rAF — if the
// camera moved in a React commit instead, the cursors would land on a different
// frame from the content and visibly detach during any pan. Sharing one
// transform makes that impossible rather than merely unlikely.

import { useEffect, useRef, type RefObject } from "react";
import { gridStyle, type ViewportStore } from "@/lib/board/viewport";

export function CameraLayer({
  store,
  gridRef,
  children,
}: {
  store: ViewportStore;
  /** The dot grid, which tracks the camera through its background rather than a transform. */
  gridRef: RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const cameraRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    let frame = 0;

    const write = () => {
      frame = 0;
      const viewport = store.getSnapshot();

      camera.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
      // Read by anything that must keep its size on screen while the board
      // scales under it: selection handles, remote cursors, hover outlines.
      camera.style.setProperty("--cam-scale", String(viewport.scale));

      const grid = gridRef.current;
      if (grid) {
        const style = gridStyle(viewport);
        grid.style.backgroundSize = style.backgroundSize;
        grid.style.backgroundPosition = style.backgroundPosition;
        grid.style.opacity = style.opacity;
      }
    };

    // Coalesce a burst of wheel events into one write per frame.
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(write);
    };

    write();
    const unsubscribe = store.subscribe(schedule);
    return () => {
      unsubscribe();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [store, gridRef]);

  return (
    // Deliberately no `will-change: transform`: it pins a composited layer that
    // gets raster-scaled rather than re-rasterised, which makes note text blurry
    // at anything but 100% zoom.
    <div ref={cameraRef} className="absolute left-0 top-0 origin-top-left">
      {children}
    </div>
  );
}
