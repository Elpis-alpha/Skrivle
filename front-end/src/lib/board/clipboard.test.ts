import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { LOCAL } from "@/lib/realtime/board-session";
import { elements } from "@/lib/realtime/doc-schema";
import { centredOn, copyPayload, MAX_PASTE, nudged, parsePayload } from "./clipboard";
import { bboxOf, unionRects } from "./geometry";
import {
  applyTextEdit,
  createElement,
  insertElements,
  orderedIds,
  pointsOf,
  readElement,
  textOf,
} from "./elements";
import { MAX_POINTS } from "./stroke";

let doc: Y.Doc;
beforeEach(() => {
  doc = new Y.Doc();
});

const snapshot = (id: string) => readElement(id, elements(doc).get(id)!);

describe("copy and paste", () => {
  it("brings back what was copied — text, ink and all — as new elements", () => {
    const note = createElement(doc, { kind: "note", x: 0, y: 0, w: 160, h: 160, withText: true });
    applyTextEdit(doc, textOf(elements(doc).get(note)!)!, "hello");
    const stroke = createElement(doc, { kind: "path", x: 10, y: 10, w: 0, h: 0, points: [0, 0, 5, 5] });

    const pasted = insertElements(doc, parsePayload(copyPayload(doc, [note, stroke]))!);

    expect(pasted).toHaveLength(2);
    expect(pasted).not.toContain(note);
    expect(snapshot(pasted[0]).kind).toBe("note");
    expect(textOf(elements(doc).get(pasted[0])!)?.toString()).toBe("hello");
    expect(pointsOf(elements(doc).get(pasted[1])!)?.toArray()).toEqual([0, 0, 5, 5]);
  });

  it("keeps the copied elements' stacking, whatever order they were selected in", () => {
    const below = createElement(doc, { kind: "rect", x: 0, y: 0, w: 10, h: 10 });
    const above = createElement(doc, { kind: "ellipse", x: 0, y: 0, w: 10, h: 10 });

    const pasted = insertElements(doc, parsePayload(copyPayload(doc, [above, below]))!);

    expect(pasted.map((id) => snapshot(id).kind)).toEqual(["rect", "ellipse"]);
    expect(orderedIds(doc).slice(-2)).toEqual(pasted);
  });

  it("pastes as one change, so one undo takes it all back", () => {
    const a = createElement(doc, { kind: "rect", x: 0, y: 0, w: 10, h: 10 });
    const b = createElement(doc, { kind: "rect", x: 20, y: 0, w: 10, h: 10 });
    const payload = parsePayload(copyPayload(doc, [a, b]))!;

    const origins: unknown[] = [];
    doc.on("update", (_update: Uint8Array, origin: unknown) => origins.push(origin));
    insertElements(doc, payload);

    expect(origins).toEqual([LOCAL]);
  });
});

describe("parsePayload", () => {
  it("ignores clipboard text that didn't come from a board", () => {
    expect(parsePayload("just some words")).toBeNull();
    expect(parsePayload(JSON.stringify({ elements: [] }))).toBeNull();
    expect(parsePayload(JSON.stringify([1, 2, 3]))).toBeNull();
  });

  // Anything can be on a clipboard, and a paste writes straight into a doc
  // every peer renders.
  it("keeps only elements it can read, skipping the rest", () => {
    const payload = JSON.stringify({
      skrivle: 1,
      elements: [
        { kind: "rect", x: 1, y: 2, w: 3, h: 4 },
        { kind: "spaceship", x: 1, y: 2, w: 3, h: 4 },
        { kind: "rect", x: "left", y: 2, w: 3, h: 4 },
        null,
      ],
    });
    expect(parsePayload(payload)).toEqual([expect.objectContaining({ kind: "rect", x: 1 })]);
  });

  it("caps how much one paste can put on the board", () => {
    const many = Array.from({ length: MAX_PASTE + 20 }, () => ({ kind: "rect", x: 0, y: 0, w: 1, h: 1 }));
    expect(parsePayload(JSON.stringify({ skrivle: 1, elements: many }))).toHaveLength(MAX_PASTE);
  });

  it("caps a stroke's samples the way drawing does", () => {
    const points = Array.from({ length: (MAX_POINTS + 50) * 2 }, (_, i) => i);
    const [stroke] = parsePayload(
      JSON.stringify({ skrivle: 1, elements: [{ kind: "path", x: 0, y: 0, w: 1, h: 1, points }] }),
    )!;
    expect(stroke.points).toHaveLength(MAX_POINTS * 2);
  });
});

describe("placing a paste", () => {
  const group = [
    { kind: "rect" as const, x: 0, y: 0, w: 100, h: 50 },
    // Drawn up and to the left: its box starts before its anchor.
    { kind: "line" as const, x: 300, y: 100, w: -100, h: -50 },
  ];
  const boxOf = (inits: typeof group) => unionRects(inits.map((init) => bboxOf(init)))!;

  it("centres the whole group on a point, keeping its shape", () => {
    const placed = centredOn(group, { x: 1000, y: 500 });
    const box = boxOf(placed);
    expect(box.x + box.w / 2).toBe(1000);
    expect(box.y + box.h / 2).toBe(500);
    expect(placed[1].w).toBe(-100);
  });

  it("nudges every element by the same amount", () => {
    expect(nudged(group, 16).map((init) => [init.x, init.y])).toEqual([
      [16, 16],
      [316, 116],
    ]);
  });
});
