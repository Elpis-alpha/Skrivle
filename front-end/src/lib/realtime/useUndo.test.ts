import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createElement, moveBy, orderedIds, readElement, removeElements } from "@/lib/board/elements";
import { elements } from "./doc-schema";
import { useUndo } from "./useUndo";

let doc: Y.Doc;
beforeEach(() => {
  doc = new Y.Doc();
});

const rect = { kind: "rect", x: 0, y: 0, w: 100, h: 50 } as const;
const positionOf = (id: string) => {
  const map = elements(doc).get(id);
  return map ? readElement(id, map) : null;
};

/** What arriving from the server looks like: a different doc, applied as REMOTE. */
function asPeer(build: (peer: Y.Doc) => void) {
  const peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
  build(peer);
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer), Symbol("remote"));
}

describe("useUndo", () => {
  it("undoes a create", () => {
    const { result } = renderHook(() => useUndo(doc));
    const id = createElement(doc, rect);

    act(() => result.current.undo());
    expect(orderedIds(doc)).toEqual([]);
    expect(elements(doc).has(id)).toBe(false);
  });

  it("redoes what it undid", () => {
    const { result } = renderHook(() => useUndo(doc));
    const id = createElement(doc, rect);

    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(orderedIds(doc)).toEqual([id]);
  });

  it("undoes a move back to where it was", () => {
    const { result } = renderHook(() => useUndo(doc));
    const id = createElement(doc, { ...rect, x: 10, y: 20 });
    result.current.stopCapturing();
    moveBy(doc, [id], 100, 50);
    expect(positionOf(id)).toMatchObject({ x: 110, y: 70 });

    act(() => result.current.undo());
    expect(positionOf(id)).toMatchObject({ x: 10, y: 20 });
  });

  it("brings back a deleted element", () => {
    const { result } = renderHook(() => useUndo(doc));
    const id = createElement(doc, rect);
    result.current.stopCapturing();
    removeElements(doc, [id]);

    act(() => result.current.undo());
    expect(orderedIds(doc)).toEqual([id]);
  });

  // The line that matters: undo is personal. Reaching across and deleting a
  // colleague's work because you pressed Cmd+Z would be indefensible.
  it("never undoes a peer's work", () => {
    const { result } = renderHook(() => useUndo(doc));
    let peerId = "";
    asPeer((peer) => {
      peerId = createElement(peer, { ...rect, x: 500 });
    });
    expect(orderedIds(doc)).toContain(peerId);

    act(() => result.current.undo());
    expect(orderedIds(doc)).toContain(peerId);
  });

  it("undoes only our own element when both are present", () => {
    const { result } = renderHook(() => useUndo(doc));
    const mine = createElement(doc, rect);
    let theirs = "";
    asPeer((peer) => {
      theirs = createElement(peer, { ...rect, x: 500 });
    });

    act(() => result.current.undo());
    expect(orderedIds(doc)).toEqual([theirs]);
    expect(elements(doc).has(mine)).toBe(false);
  });

  // Gestures call stopCapturing() as they begin, so one Cmd+Z undoes one
  // gesture — never half a drag, and never two of them at once.
  it("treats each gesture as one entry", () => {
    const { result } = renderHook(() => useUndo(doc));
    const id = createElement(doc, { ...rect, x: 0, y: 0 });

    result.current.stopCapturing();
    moveBy(doc, [id], 10, 0);
    moveBy(doc, [id], 10, 0); // same gesture: two throttled flushes
    result.current.stopCapturing();
    moveBy(doc, [id], 100, 0); // a second, separate gesture

    expect(positionOf(id)?.x).toBe(120);
    act(() => result.current.undo());
    expect(positionOf(id)?.x).toBe(20);
    act(() => result.current.undo());
    expect(positionOf(id)?.x).toBe(0);
  });

  it("does nothing without a document", () => {
    const { result } = renderHook(() => useUndo(null));
    expect(() => {
      result.current.undo();
      result.current.redo();
      result.current.stopCapturing();
    }).not.toThrow();
  });
});
