"use client";

// STYLE_GUIDE.md §10.7 — sticky note.
//
// Min 160x160, grows downward, `--ink` text on a §2.5 fill. `--elev-1` only
// while dragging: at rest the 1px darker border does the work, which is what
// keeps a board of forty notes from looking like a pile of cards.

import type * as Y from "yjs";
import type { ElementSnapshot } from "@/lib/realtime/doc-schema";
import { NOTE_CLASS, NOTE_PADDING, noteSurface } from "../note-style";
import { TextEditor } from "./TextEditor";

export function NoteView({
  el,
  map,
  doc,
  editing,
  onEndEdit,
  dragging,
}: {
  el: ElementSnapshot;
  map: Y.Map<unknown>;
  doc: Y.Doc;
  editing: boolean;
  onEndEdit: () => void;
  dragging: boolean;
}) {
  return (
    <div
      className={`size-full overflow-hidden ${NOTE_CLASS} ${dragging ? "shadow-elev-1" : ""}`}
      style={{ ...noteSurface(el.fill), padding: NOTE_PADDING }}
    >
      <TextEditor
        doc={doc}
        map={map}
        el={el}
        editing={editing}
        onEndEdit={onEndEdit}
        placeholder=""
        className="text-ink"
      />
    </div>
  );
}
