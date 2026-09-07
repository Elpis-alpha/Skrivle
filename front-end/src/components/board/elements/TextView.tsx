"use client";

// STYLE_GUIDE.md §10.9 — text box.
//
// No border or background until hovered or editing, so text on the canvas reads
// as writing rather than as a widget.

import type * as Y from "yjs";
import type { ElementSnapshot } from "@/lib/realtime/doc-schema";
import { TextEditor } from "./TextEditor";
import { strokePaint } from "./ShapeView";

export function TextView({
  el,
  map,
  doc,
  editing,
  onEndEdit,
}: {
  el: ElementSnapshot;
  map: Y.Map<unknown>;
  doc: Y.Doc;
  editing: boolean;
  onEndEdit: () => void;
}) {
  return (
    <div
      className={
        "size-full overflow-hidden " +
        (editing ? "border border-accent" : "border border-dashed border-transparent")
      }
      // Colour comes from the stroke picker (§10.9), so a text box and a line
      // drawn in the same ink match.
      style={{ color: strokePaint(el.stroke) }}
    >
      <TextEditor
        doc={doc}
        map={map}
        el={el}
        editing={editing}
        onEndEdit={onEndEdit}
        placeholder="Type something"
      />
    </div>
  );
}
