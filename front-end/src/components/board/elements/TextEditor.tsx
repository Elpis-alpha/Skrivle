"use client";

// Text on the canvas, bound to a Y.Text.
//
// A textarea rather than contenteditable: §10.7 and §10.9 both specify plain
// text, and contenteditable would buy browser-inserted <div>/<br>, execCommand
// divergence and a much worse IME story for nothing.
//
// A plain string field would be simpler still and is the wrong answer: it is
// last-writer-wins per keystroke, so two people in one note lose each other's
// characters AND watch their own text revert under the cursor. Two people on
// one board is the entire product.

import { useEffect, useLayoutEffect, useRef } from "react";
import * as Y from "yjs";
import { applyTextEdit, textOf, updateElement } from "@/lib/board/elements";
import type { ElementSnapshot } from "@/lib/realtime/doc-schema";
import { useYText } from "@/lib/realtime/useElements";
import { NOTE_PADDING } from "../note-style";

type Caret = { start: number; end: number };

/**
 * Where the caret ends up after a remote edit lands.
 *
 * Without this the caret jumps to the end of the note every time someone else
 * types, which makes collaborative editing unusable rather than merely untidy.
 */
export function mapCaret(caret: Caret, delta: readonly Y.YTextEvent["delta"][number][]): Caret {
  let index = 0;
  let { start, end } = caret;

  for (const op of delta) {
    if (typeof op.retain === "number") {
      index += op.retain;
      continue;
    }
    if (typeof op.insert === "string") {
      const length = op.insert.length;
      // An insert exactly AT the caret goes after it, so the caret holds still.
      if (index < start) start += length;
      if (index < end) end += length;
      index += length;
      continue;
    }
    if (typeof op.delete === "number") {
      if (index < start) start -= Math.min(op.delete, start - index);
      if (index < end) end -= Math.min(op.delete, end - index);
    }
  }

  return { start: Math.max(0, start), end: Math.max(0, end) };
}

export function TextEditor({
  doc,
  map,
  el,
  editing,
  onEndEdit,
  placeholder,
  className = "",
}: {
  doc: Y.Doc;
  map: Y.Map<unknown>;
  el: ElementSnapshot;
  editing: boolean;
  onEndEdit: () => void;
  placeholder: string;
  className?: string;
}) {
  const text = textOf(map);
  const value = useYText(text);

  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<Caret | null>(null);
  const composing = useRef(false);

  // Track where the caret should land after a remote edit. Only remote ones:
  // our own edits already leave the caret where the browser put it.
  useEffect(() => {
    if (!text || !editing) return;

    const onRemoteChange = (event: Y.YTextEvent, transaction: Y.Transaction) => {
      if (transaction.local) return;
      const field = ref.current;
      if (!field) return;
      pendingCaret.current = mapCaret(
        { start: field.selectionStart, end: field.selectionEnd },
        event.delta,
      );
    };

    text.observe(onRemoteChange);
    return () => text.unobserve(onRemoteChange);
  }, [text, editing]);

  // Restore it after React has committed the new value, not before.
  useLayoutEffect(() => {
    const field = ref.current;
    const caret = pendingCaret.current;
    if (!field || !caret) return;
    pendingCaret.current = null;
    field.setSelectionRange(caret.start, caret.end);
  });

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  // §10.7 — a note grows downward as it fills up.
  //
  // Measured with scrollHeight, never getBoundingClientRect: inside the camera
  // that would return transformed screen pixels and the note would resize
  // itself differently at every zoom level.
  //
  // Only the person editing writes the height. Every client measures slightly
  // differently depending on font loading, so letting them all write it would
  // have peers fighting over the value forever.
  useEffect(() => {
    if (!editing) return;
    const field = ref.current;
    if (!field) return;
    const needed = field.scrollHeight + NOTE_PADDING * 2;
    if (needed > el.h) updateElement(doc, el.id, { h: needed });
  }, [value, editing, el.h, el.id, doc]);

  const typography = {
    fontSize: el.fontSize,
    lineHeight: 1.45,
    fontWeight: 400, // §3 — canvas text is Regular, never the scale's baked-in 600.
  } as const;

  if (!editing) {
    return (
      <div
        className={`size-full whitespace-pre-wrap break-words ${className}`}
        style={typography}
      >
        {value || <span className="text-ink-muted">{placeholder}</span>}
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      value={value}
      aria-label="Element text"
      // The only element on the canvas that takes pointer events: everything
      // else is hit-tested geometrically.
      className={`size-full resize-none border-0 bg-transparent p-0 outline-none pointer-events-auto caret-accent ${className}`}
      style={typography}
      placeholder={placeholder}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        if (text) applyTextEdit(doc, text, event.currentTarget.value);
      }}
      onChange={(event) => {
        // Writing mid-composition closes the IME candidate window on every
        // keystroke, which makes CJK input impossible. The compositionend
        // handler above commits the finished word instead.
        if (composing.current || !text) return;
        applyTextEdit(doc, text, event.currentTarget.value);
      }}
      onBlur={onEndEdit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onEndEdit();
        }
        // Otherwise every keystroke in a note would also be a tool shortcut.
        event.stopPropagation();
      }}
    />
  );
}
