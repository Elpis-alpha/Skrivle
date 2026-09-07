"use client";

// STYLE_GUIDE.md §10.7 / §10.8 — "1px --accent bounding box with 6px --accent
// square handles at corners/edges", and endpoint handles only for a line.
//
// §1 puts your own selection in the amethyst family, alongside your cursor —
// everyone else's presence borrows a hue from the cursor palette instead.
//
// Lives inside the camera so it can never tear away from what it is outlining,
// and counter-scales itself so a handle stays 6px on screen at any zoom. §12
// requires selection to be outline AND handles, never colour alone.

import type * as Y from "yjs";
import { bboxOf, handlePosition, HANDLES, type Handle } from "@/lib/board/geometry";
import { useElement } from "@/lib/realtime/useElements";

/** §10.7 — 6px squares. Counter-scaled, so this is screen pixels. */
const HANDLE_PX = 6;

export function SelectionLayer({
  doc,
  ids,
  marqueeRef,
}: {
  doc: Y.Doc;
  ids: readonly string[];
  marqueeRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {ids.map((id) => (
        // Handles are only offered for a single selection: there is nothing
        // sensible for one grip to do to six elements at once.
        <SelectionBox key={id} doc={doc} id={id} withHandles={ids.length === 1} />
      ))}

      <div
        ref={marqueeRef}
        hidden
        aria-hidden
        data-testid="board-marquee"
        className="pointer-events-none absolute border-accent bg-accent/10"
        // In board units, so it renders as 1px on screen whatever the zoom.
        style={{ borderWidth: "calc(1px / var(--cam-scale, 1))" }}
      />
    </>
  );
}

function SelectionBox({
  doc,
  id,
  withHandles,
}: {
  doc: Y.Doc;
  id: string;
  withHandles: boolean;
}) {
  const el = useElement(doc, id);
  if (!el) return null;

  const box = bboxOf(el);
  const handles: readonly Handle[] = el.kind === "line" ? ["nw", "se"] : HANDLES;

  return (
    <div
      data-testid="board-selection"
      data-element-id={id}
      className="pointer-events-none absolute"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <div
        className="absolute inset-0 border-accent"
        style={{ borderWidth: "calc(1px / var(--cam-scale, 1))" }}
      />

      {withHandles
        ? handles.map((handle) => {
            const at = handlePosition({ x: 0, y: 0, w: box.w, h: box.h }, handle);
            return (
              <div
                key={handle}
                data-handle={handle}
                className="absolute bg-accent"
                style={{
                  left: at.x,
                  top: at.y,
                  width: HANDLE_PX,
                  height: HANDLE_PX,
                  // Scaling the handle rather than sizing it with calc() keeps
                  // its hit area honest and avoids a sub-pixel box that some
                  // browsers decline to paint at all.
                  transform: "translate(-50%, -50%) scale(calc(1 / var(--cam-scale, 1)))",
                }}
              />
            );
          })
        : null}
    </div>
  );
}
