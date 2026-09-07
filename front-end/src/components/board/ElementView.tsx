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
import { useElement, useElementMap } from "@/lib/realtime/useElements";
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
}) {
  const el = useElement(doc, id);
  const map = useElementMap(doc, id);

  // Deleted while we were rendering it — by a peer, or by an undo.
  if (!el || !map) return null;

  const box = bboxOf(el);

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
        // Skip the work of painting elements scrolled far off screen.
        contentVisibility: "auto",
        containIntrinsicSize: `${Math.max(box.w, 1)}px ${Math.max(box.h, 1)}px`,
      }}
    >
      {el.kind === "note" ? (
        <NoteView
          el={el}
          map={map}
          doc={doc}
          editing={editing}
          onEndEdit={onEndEdit}
          dragging={dragging}
        />
      ) : el.kind === "text" ? (
        <TextView el={el} map={map} doc={doc} editing={editing} onEndEdit={onEndEdit} />
      ) : el.kind === "path" ? (
        <PathView el={el} map={map} />
      ) : (
        <ShapeView el={el} />
      )}
    </div>
  );
}

// Every prop is a primitive or stable, so this bails out for the elements a
// selection or edit didn't touch.
export const ElementView = memo(ElementViewInner);
