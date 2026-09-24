"use client";

// One element, in its own absolutely-positioned wrapper.
//
// Every kind gets a wrapper rather than shapes sharing one big <svg> and notes
// sitting beside it as HTML. Two fixed layers could not interleave — `order` is
// a single global paint order (doc-schema.ts), and "bring this note above that
// rectangle" has to be expressible. Siblings in order sequence give that for
// free, with no z-index anywhere.

import { memo } from "react";
import type * as Y from "yjs";
import { bboxOf } from "@/lib/board/geometry";
import type { PreviewStore } from "@/lib/board/preview";
import { useShownElement } from "@/lib/board/useShownElement";
import type { ElementSnapshot } from "@/lib/realtime/doc-schema";
import { useElementMap } from "@/lib/realtime/useElements";
import { NoteView } from "./elements/NoteView";
import { PathView } from "./elements/PathView";
import { ShapeView } from "./elements/ShapeView";
import { TextView } from "./elements/TextView";

/** §7 — "elements fade in with an 8px rise, staggered ~20ms in document order". */
const STAGGER_MS = 20;

/**
 * §7 puts the whole settle under --dur-settle (400ms), so the stagger cannot
 * run the length of the board: 300 elements at 20ms would be a six-second
 * entrance. After this many, everything arrives together.
 */
const MAX_STAGGERED = 15;

function ElementViewInner({
  doc,
  id,
  index,
  editing,
  dragging,
  onEndEdit,
  settling,
  preview = null,
}: {
  doc: Y.Doc;
  id: string;
  index: number;
  editing: boolean;
  dragging: boolean;
  onEndEdit: () => void;
  /**
   * Read once, at mount. Passing it live would give a note a peer creates ten
   * minutes from now the entrance animation and a stale index-derived delay,
   * so it would pop in seconds after it appeared.
   */
  settling: boolean;
  /** A resize or draw-out in progress shows its frame-rate box here (preview.ts). */
  preview?: PreviewStore | null;
}) {
  const resolved = useShownElement(doc, id, preview);
  const map = useElementMap(doc, id);

  // Deleted while we were rendering it — by a peer, or by an undo.
  if (!resolved || !map) return null;

  // Every view below reads its geometry from `shown`, never from `el` — see
  // useShownElement for what the two differ by.
  const { el, shown } = resolved;
  const box = bboxOf(shown);

  return (
    <div
      data-testid="board-element"
      data-element-id={id}
      data-kind={el.kind}
      className={
        // Hit-testing is geometric (geometry.ts), so nothing here competes for
        // the pointer. The editing textarea opts back in for itself.
        "pointer-events-none absolute " + (settling ? "board-settle-in" : "")
      }
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        animationDelay: settling ? `${Math.min(index, MAX_STAGGERED) * STAGGER_MS}ms` : undefined,
        // No content-visibility or `contain: paint` here, tempting as skipping
        // off-screen paint is: both clip to this box, and ink routinely runs
        // past it — the outer half of every centred outline, an arrowhead at
        // the box edge, a stroke's tip drawn ahead of the box the doc knows.
      }}
    >
      {el.kind === "note" ? (
        <NoteView
          el={shown}
          map={map}
          doc={doc}
          editing={editing}
          onEndEdit={onEndEdit}
          dragging={dragging}
        />
      ) : el.kind === "text" ? (
        <TextView el={shown} map={map} doc={doc} editing={editing} onEndEdit={onEndEdit} />
      ) : el.kind === "path" ? (
        <PathView el={shown} map={map} stretch={stretchOf(el, shown)} />
      ) : (
        <ShapeView el={shown} />
      )}
    </div>
  );
}

/**
 * How far a stroke's samples must stretch to fill the box being shown.
 *
 * The samples in the document match the document's box. While something else
 * is being shown — a resize not yet written — they are scaled to fit rather
 * than rewritten, and snap back to 1 when the document catches up.
 */
function stretchOf(doc: ElementSnapshot, shown: ElementSnapshot): { x: number; y: number } {
  return {
    x: doc.w > 0 ? shown.w / doc.w : 1,
    y: doc.h > 0 ? shown.h / doc.h : 1,
  };
}

// Every prop is a primitive or stable, so this bails out for the elements a
// selection or edit didn't touch.
export const ElementView = memo(ElementViewInner);
