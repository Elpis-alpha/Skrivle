"use client";

// A freehand stroke.
//
// The samples never pass through React. A stroke being drawn appends a few
// numbers every 50ms, and a 600-point path pushed through a render would be the
// one thing on this canvas fast enough to drop frames — so the `d` attribute is
// written straight onto the DOM from the Y.Array's own observer.
//
// The scalars still come through React, because the bounding box has to move
// the wrapper.

import { useEffect, useRef } from "react";
import type * as Y from "yjs";
import { pointsOf } from "@/lib/board/elements";
import { bboxOf } from "@/lib/board/geometry";
import { strokeOutline } from "@/lib/board/stroke";
import type { ElementSnapshot } from "@/lib/realtime/doc-schema";
import { strokePaint } from "./ShapeView";

export function PathView({
  el,
  map,
  stretch = UNSTRETCHED,
}: {
  el: ElementSnapshot;
  map: Y.Map<unknown>;
  /** Scales the samples to a box the document hasn't caught up with yet. */
  stretch?: { x: number; y: number };
}) {
  const pathRef = useRef<SVGPathElement>(null);

  const width = el.strokeWidth;

  useEffect(() => {
    const points = pointsOf(map);
    if (!points) return;

    const write = () => {
      const path = pathRef.current;
      if (path) path.setAttribute("d", strokeOutline(points.toArray(), width));
    };

    write();
    points.observe(write);
    return () => points.unobserve(write);
  }, [map, width]);

  const box = bboxOf(el);
  const stretched = stretch.x !== 1 || stretch.y !== 1;

  return (
    <svg
      width={Math.max(box.w, 1)}
      height={Math.max(box.h, 1)}
      style={{ overflow: "visible" }}
      aria-hidden
    >
      {/* Samples are relative to the anchor, which is not the top-left of the
          box when the stroke ran up or left. This puts them back in the box.
          Scale applies first, so the offset is in the shown box's units. */}
      <g
        transform={
          `translate(${-el.bx}, ${-el.by})` +
          (stretched ? ` scale(${stretch.x}, ${stretch.y})` : "")
        }
      >
        {/* The ink is the outline of the stroke (stroke.ts), so it is filled
            rather than stroked — that is what lets it taper. */}
        <path ref={pathRef} fill={strokePaint(el.stroke)} stroke="none" />
      </g>
    </svg>
  );
}

const UNSTRETCHED = { x: 1, y: 1 };
