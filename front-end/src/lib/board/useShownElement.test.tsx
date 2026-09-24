import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { elements } from "@/lib/realtime/doc-schema";
import { appendPoints, createElement, updateElement } from "./elements";
import { INTERPOLATE_MS } from "./motion";
import { createPreviewStore } from "./preview";
import { useShownElement } from "./useShownElement";

let doc: Y.Doc;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
  doc = new Y.Doc();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A change made the way a peer's arrives: as an update from another doc. */
function peerChange(id: string, fields: Record<string, unknown>) {
  const peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
  const map = elements(peer).get(id)!;
  peer.transact(() => {
    for (const [key, value] of Object.entries(fields)) map.set(key, value);
  });
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer, Y.encodeStateVector(doc)));
}

const asPeer = (id: string, fields: Record<string, unknown>) =>
  act(() => peerChange(id, fields));

const rect = () => createElement(doc, { kind: "rect", x: 0, y: 0, w: 100, h: 100 });

describe("useShownElement", () => {
  it("holds a peer's move at the old spot on the render it lands", () => {
    const id = rect();
    const { result } = renderHook(() => useShownElement(doc, id));

    asPeer(id, { x: 100 });

    expect(result.current?.el.x).toBe(100);
    expect(result.current?.shown.x).toBe(0);
  });

  it("is part of the way there after one frame", () => {
    const id = rect();
    const { result } = renderHook(() => useShownElement(doc, id));

    asPeer(id, { x: 100 });
    act(() => vi.advanceTimersToNextFrame());

    const x = result.current!.shown.x;
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(100);
  });

  it("arrives exactly, and stops, within a few interpolation windows", () => {
    const id = rect();
    const { result } = renderHook(() => useShownElement(doc, id));

    asPeer(id, { x: 100, w: 300 });
    act(() => vi.advanceTimersByTime(INTERPOLATE_MS * 6));

    expect(result.current?.shown).toMatchObject({ x: 100, w: 300 });
    expect(vi.getTimerCount()).toBe(0);
  });

  // Peers publish every 50ms and an ease takes about as long, so the next
  // update routinely lands on the very frame the last ease arrives.
  it("keeps easing when a peer's next update lands on the frame the last one arrived", () => {
    const id = rect();
    const { result } = renderHook(() => useShownElement(doc, id));

    asPeer(id, { x: 100 });
    // Right up to the frame before it lands.
    while (100 - result.current!.shown.x > 0.6) act(() => vi.advanceTimersToNextFrame());
    act(() => {
      vi.advanceTimersToNextFrame();
      peerChange(id, { x: 200 });
    });
    act(() => vi.advanceTimersByTime(INTERPOLATE_MS * 6));

    expect(result.current?.shown.x).toBe(200);
  });

  it("applies our own changes at once — they already painted at frame rate", () => {
    const id = rect();
    const { result } = renderHook(() => useShownElement(doc, id));

    act(() => updateElement(doc, id, { x: 100 }));

    expect(result.current?.shown.x).toBe(100);
  });

  it("follows a gesture's preview exactly, with no easing", () => {
    const id = rect();
    const preview = createPreviewStore();
    const { result } = renderHook(() => useShownElement(doc, id, preview));

    act(() => preview.set(id, { x: 40, y: 0, w: 100, h: 100 }));

    expect(result.current?.shown.x).toBe(40);
  });

  it("eases a stroke's position but never its size", () => {
    // A stroke's size changes as its samples arrive, and those are drawn the
    // moment they land — easing the box would squash the ink already there.
    const id = createElement(doc, { kind: "path", x: 0, y: 0, w: 0, h: 0, points: [0, 0] });
    act(() => appendPoints(doc, id, [50, 50]));
    const { result } = renderHook(() => useShownElement(doc, id));

    asPeer(id, { x: 100, w: 80 });

    expect(result.current?.shown).toMatchObject({ x: 0, w: 80 });
  });
});
