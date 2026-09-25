import { act, render, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  appendPoints,
  applyTextEdit,
  createElement,
  removeElements,
  textOf,
  updateElement,
} from "@/lib/board/elements";
import { elements, order } from "./doc-schema";
import { useElement, useElementIds, useElementMap, useYText } from "./useElements";

let doc: Y.Doc;
beforeEach(() => {
  doc = new Y.Doc();
});

const rect = { kind: "rect", x: 0, y: 0, w: 100, h: 50 } as const;

/** Everything a peer does arrives as a transaction on our doc, same as this. */
const asPeer = (fn: () => void) => act(() => fn());

describe("useElementIds", () => {
  it("is empty for a board with no document yet", () => {
    const { result } = renderHook(() => useElementIds(null));
    expect(result.current).toEqual([]);
  });

  it("lists the ids in paint order", () => {
    const a = createElement(doc, rect);
    const b = createElement(doc, rect);
    const { result } = renderHook(() => useElementIds(doc));
    expect(result.current).toEqual([a, b]);
  });

  it("re-renders when a peer adds an element", () => {
    const { result } = renderHook(() => useElementIds(doc));
    expect(result.current).toEqual([]);

    let id = "";
    asPeer(() => {
      id = createElement(doc, rect);
    });
    expect(result.current).toEqual([id]);
  });

  it("re-renders when a peer removes one", () => {
    const a = createElement(doc, rect);
    const b = createElement(doc, rect);
    const { result } = renderHook(() => useElementIds(doc));

    asPeer(() => removeElements(doc, [a]));
    expect(result.current).toEqual([b]);
  });

  it("re-renders when the paint order changes without the elements changing", () => {
    const a = createElement(doc, rect);
    const b = createElement(doc, rect);
    const { result } = renderHook(() => useElementIds(doc));

    asPeer(() =>
      doc.transact(() => {
        order(doc).delete(0, 2);
        order(doc).push([b, a]);
      }),
    );
    expect(result.current).toEqual([b, a]);
  });

  // useSyncExternalStore compares by identity: a fresh array every call would
  // loop React forever.
  it("returns the same array while nothing has changed", () => {
    createElement(doc, rect);
    const { result, rerender } = renderHook(() => useElementIds(doc));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe("useElement", () => {
  it("is null when there is no such element", () => {
    const { result } = renderHook(() => useElement(doc, "nope"));
    expect(result.current).toBeNull();
  });

  it("reads the element's scalars", () => {
    const id = createElement(doc, { ...rect, fill: "mint" });
    const { result } = renderHook(() => useElement(doc, id));
    expect(result.current).toMatchObject({ id, kind: "rect", w: 100, fill: "mint" });
  });

  it("re-renders when a peer moves it", () => {
    const id = createElement(doc, rect);
    const { result } = renderHook(() => useElement(doc, id));

    asPeer(() => updateElement(doc, id, { x: 42 }));
    expect(result.current?.x).toBe(42);
  });

  it("returns the same snapshot while nothing has changed", () => {
    const id = createElement(doc, rect);
    const { result, rerender } = renderHook(() => useElement(doc, id));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  // The trap: Yjs drops a deleted type from the changed set and skips its
  // observers, so an element watching only itself renders a ghost forever.
  // The parent map is the only thing that reports its own deletion.
  it("goes null when a peer deletes it out from under us", () => {
    const id = createElement(doc, rect);
    const { result } = renderHook(() => useElement(doc, id));
    expect(result.current).not.toBeNull();

    asPeer(() => removeElements(doc, [id]));
    expect(result.current).toBeNull();
  });

  // Undoing a delete puts a *different* Y.Map at the same id, so the
  // subscription has to follow it or the element goes permanently stale.
  it("follows the element when it is replaced rather than changed", () => {
    const id = createElement(doc, rect);
    const { result } = renderHook(() => useElement(doc, id));

    asPeer(() =>
      doc.transact(() => {
        elements(doc).delete(id);
        const replacement = new Y.Map<unknown>();
        replacement.set("kind", "ellipse");
        replacement.set("x", 7);
        elements(doc).set(id, replacement);
      }),
    );
    expect(result.current).toMatchObject({ kind: "ellipse", x: 7 });

    // And keeps tracking the new map, not the old one.
    asPeer(() => updateElement(doc, id, { x: 99 }));
    expect(result.current?.x).toBe(99);
  });

  // The whole reason text and points get their own subscriptions: a shallow
  // observer never sees inside them, so putting them in this snapshot would
  // make it silently stale.
  it("does not re-render for text or pen samples, which it never reports", () => {
    const id = createElement(doc, {
      ...rect,
      kind: "note",
      withText: true,
      points: [0, 0],
    });
    const { result } = renderHook(() => useElement(doc, id));
    const before = result.current;

    asPeer(() => applyTextEdit(doc, textOf(elements(doc).get(id)!)!, "typing"));
    expect(result.current).toBe(before);
  });

  it("still tracks the bounding box a stroke grows into", () => {
    const id = createElement(doc, { ...rect, kind: "path", w: 0, h: 0, points: [0, 0] });
    const { result } = renderHook(() => useElement(doc, id));

    asPeer(() => appendPoints(doc, id, [30, 70]));
    expect(result.current).toMatchObject({ w: 30, h: 70 });
  });
});

describe("useElementMap", () => {
  it("hands back the live Yjs type, with a stable identity", () => {
    const id = createElement(doc, { ...rect, withText: true });
    const { result, rerender } = renderHook(() => useElementMap(doc, id));
    const first = result.current;

    expect(first).toBe(elements(doc).get(id));
    rerender();
    expect(result.current).toBe(first);
  });

  it("goes null once the element is deleted", () => {
    const id = createElement(doc, rect);
    const { result } = renderHook(() => useElementMap(doc, id));
    asPeer(() => removeElements(doc, [id]));
    expect(result.current).toBeNull();
  });
});

describe("useYText", () => {
  const noteText = () => {
    const id = createElement(doc, { ...rect, kind: "note", withText: true });
    return textOf(elements(doc).get(id)!)!;
  };

  it("is empty when there is no text", () => {
    const { result } = renderHook(() => useYText(null));
    expect(result.current).toBe("");
  });

  it("reads what is there", () => {
    const text = noteText();
    applyTextEdit(doc, text, "hello");
    const { result } = renderHook(() => useYText(text));
    expect(result.current).toBe("hello");
  });

  // This is the subscription that a shallow element observer cannot provide.
  it("re-renders when a peer types into it", () => {
    const text = noteText();
    const { result } = renderHook(() => useYText(text));

    asPeer(() => applyTextEdit(doc, text, "from a peer"));
    expect(result.current).toBe("from a peer");
  });

  it("reflects a peer deleting characters", () => {
    const text = noteText();
    applyTextEdit(doc, text, "hello world");
    const { result } = renderHook(() => useYText(text));

    asPeer(() => applyTextEdit(doc, text, "hello"));
    expect(result.current).toBe("hello");
  });
});

// React runs a child's effects before its parent's, so a child that writes to
// the doc on mount — the text editor growing its box, say — lands between the
// parent's first read and its subscription. React re-reads once it subscribes,
// but that only helps if the cache already knows about the write.
describe("a change made before the subscription exists", () => {
  /** Runs `write` in an effect below whatever renders it. */
  function OnMount({ write }: { write: () => void }) {
    useEffect(write, [write]);
    return null;
  }

  it("still reaches useElement", () => {
    const id = createElement(doc, rect);
    const grow = () => updateElement(doc, id, { h: 80 });
    let seen: ReturnType<typeof useElement> = null;
    function Watch() {
      seen = useElement(doc, id);
      return <OnMount write={grow} />;
    }

    render(<Watch />);
    expect(seen).toMatchObject({ h: 80 });
  });

  it("still reaches useElementIds", () => {
    let added = "";
    const add = () => {
      added = createElement(doc, rect);
    };
    let seen: readonly string[] = [];
    function Watch() {
      seen = useElementIds(doc);
      return <OnMount write={add} />;
    }

    render(<Watch />);
    expect(seen).toEqual([added]);
  });

  it("still reaches useYText", () => {
    const id = createElement(doc, { ...rect, kind: "note", withText: true });
    const text = textOf(elements(doc).get(id)!)!;
    const type = () => applyTextEdit(doc, text, "typed");
    let seen = "";
    function Watch() {
      seen = useYText(text);
      return <OnMount write={type} />;
    }

    render(<Watch />);
    expect(seen).toBe("typed");
  });
});
