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
import { toPathData } from "@/lib/board/stroke";
import type { ElementSnapshot } from "@/lib/realtime/doc-schema";
import { strokePaint } from "./ShapeView";

export function PathView({ el, map }: { el: ElementSnapshot; map: Y.Map<unknown> }) {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const points = pointsOf(map);
    if (!points) return;

    const write = () => {
      const path = pathRef.current;
      if (path) path.setAttribute("d", toPathData(points.toArray()));
    };

    write();
    points.observe(write);
    return () => points.unobserve(write);
  }, [map]);

  const box = bboxOf(el);

  return (
    <svg
      width={Math.max(box.w, 1)}
      height={Math.max(box.h, 1)}
      style={{ overflow: "visible" }}
      aria-hidden
    >
      {/* Samples are relative to the anchor, which is not the top-left of the
          box when the stroke ran up or left. This puts them back in the box. */}
      <g transform={`translate(${-el.bx}, ${-el.by})`}>
        <path
          ref={pathRef}
          fill="none"
          stroke={strokePaint(el.stroke)}
          strokeWidth={el.strokeWidth}
          // §8 — round caps and joins. Also what makes a single tap a dot.
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
