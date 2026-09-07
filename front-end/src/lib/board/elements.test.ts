import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { elements, order } from "@/lib/realtime/doc-schema";
import { bboxOf } from "./geometry";
import { LOCAL } from "@/lib/realtime/board-session";
import {
  appendPoints,
  applyTextEdit,
  createElement,
  createNote,
  moveBy,
  newElementId,
  orderedIds,
  pointsOf,
  readElement,
  removeElements,
  repairOrder,
  replacePoints,
  resizeElement,
  textOf,
  updateElement,
} from "./elements";

let doc: Y.Doc;
beforeEach(() => {
  doc = new Y.Doc();
});

/** Count the updates a call puts on the wire, and note their origins. */
function recordUpdates(fn: () => void): unknown[] {
  const origins: unknown[] = [];
  const listen = (_update: Uint8Array, origin: unknown) => origins.push(origin);
  doc.on("update", listen);
  fn();
  doc.off("update", listen);
  return origins;
}

const rect = { kind: "rect", x: 0, y: 0, w: 100, h: 50 } as const;

describe("newElementId", () => {
  it("does not collide across a realistic board", () => {
    const ids = new Set(Array.from({ length: 5000 }, newElementId));
    expect(ids.size).toBe(5000);
  });
});

describe("createElement", () => {
  it("registers the element and appends it to the paint order", () => {
    const id = createElement(doc, rect);
    expect(elements(doc).has(id)).toBe(true);
    expect(order(doc).toArray()).toEqual([id]);
  });

  // One update per gesture is the whole reason writers live in this module.
  it("is a single update tagged as a local edit", () => {
    const origins = recordUpdates(() => createElement(doc, rect));
    expect(origins).toEqual([LOCAL]);
  });

  it("attaches a Y.Text only when asked", () => {
    const plain = createElement(doc, rect);
    const noted = createElement(doc, { ...rect, withText: true });
    expect(textOf(elements(doc).get(plain)!)).toBeNull();
    expect(textOf(elements(doc).get(noted)!)).toBeInstanceOf(Y.Text);
  });

  it("stores points as a Y.Array when given", () => {
    const id = createElement(doc, { ...rect, kind: "path", points: [0, 0, 5, 5] });
    expect(pointsOf(elements(doc).get(id)!)?.toArray()).toEqual([0, 0, 5, 5]);
  });

  it("rounds coordinates, because lib0 encodes an int in a third of a float", () => {
    const id = createElement(doc, { ...rect, x: 10.4, y: 20.6 });
    const el = readElement(id, elements(doc).get(id)!);
    expect(el.x).toBe(10);
    expect(el.y).toBe(21);
  });
});

describe("createNote", () => {
  // §10.7 — min 160x160.
  it("centres a minimum-size note on the click", () => {
    const id = createNote(doc, { x: 100, y: 100 }, { fill: "gray", fontSize: 14 });
    const el = readElement(id, elements(doc).get(id)!);
    expect(el).toMatchObject({ kind: "note", x: 20, y: 20, w: 160, h: 160, fill: "gray" });
  });

  it("can be typed into", () => {
    const id = createNote(doc, { x: 0, y: 0 }, { fill: "gray", fontSize: 14 });
    expect(textOf(elements(doc).get(id)!)).toBeInstanceOf(Y.Text);
  });
});

describe("readElement", () => {
  it("falls back rather than rendering garbage a peer wrote", () => {
    const map = new Y.Map<unknown>();
    doc.transact(() => {
      elements(doc).set("weird", map);
      map.set("kind", "nonsense-from-a-newer-build");
      map.set("x", "not a number");
      map.set("strokeWidth", 99);
      map.set("stroke", "chartreuse");
    });

    expect(readElement("weird", map)).toMatchObject({
      kind: "rect",
      x: 0,
      stroke: "ink",
      strokeWidth: 2,
      fill: null,
      arrow: false,
    });
  });

  it("reads the values that are there", () => {
    const id = createElement(doc, {
      ...rect,
      fill: "butter",
      stroke: "accent",
      strokeWidth: 8,
      arrow: true,
    });
    expect(readElement(id, elements(doc).get(id)!)).toMatchObject({
      fill: "butter",
      stroke: "accent",
      strokeWidth: 8,
      arrow: true,
    });
  });
});

describe("orderedIds", () => {
  it("follows the paint order", () => {
    const a = createElement(doc, rect);
    const b = createElement(doc, rect);
    expect(orderedIds(doc)).toEqual([a, b]);
  });

  // order and elements are separate root types and can disagree mid-flight.
  it("skips ids that no longer have an element", () => {
    const a = createElement(doc, rect);
    doc.transact(() => order(doc).push(["ghost"]));
    expect(orderedIds(doc)).toEqual([a]);
  });

  it("ignores a duplicated order entry", () => {
    const a = createElement(doc, rect);
    doc.transact(() => order(doc).push([a]));
    expect(orderedIds(doc)).toEqual([a]);
  });
});

describe("repairOrder", () => {
  it("makes an orphaned element reachable again", () => {
    doc.transact(() => elements(doc).set("orphan", new Y.Map()));
    expect(orderedIds(doc)).toEqual([]);
    repairOrder(doc);
    expect(orderedIds(doc)).toEqual(["orphan"]);
  });

  it("does nothing when there is nothing to repair", () => {
    createElement(doc, rect);
    expect(recordUpdates(() => repairOrder(doc))).toEqual([]);
  });

  // Maintenance must not land on the user's undo stack, or Cmd+Z makes
  // elements vanish again.
  it("is not tagged as a local edit", () => {
    doc.transact(() => elements(doc).set("orphan", new Y.Map()));
    const origins = recordUpdates(() => repairOrder(doc));
    expect(origins).toHaveLength(1);
    expect(origins[0]).not.toBe(LOCAL);
  });
});

describe("moveBy", () => {
  it("shifts every id given", () => {
    const a = createElement(doc, rect);
    const b = createElement(doc, { ...rect, x: 200 });
    moveBy(doc, [a, b], 10, -5);
    expect(readElement(a, elements(doc).get(a)!)).toMatchObject({ x: 10, y: -5 });
    expect(readElement(b, elements(doc).get(b)!)).toMatchObject({ x: 210, y: -5 });
  });

  // A 20-note drag must not be 20 messages per tick.
  it("moves a whole selection in one update", () => {
    const ids = [createElement(doc, rect), createElement(doc, rect), createElement(doc, rect)];
    expect(recordUpdates(() => moveBy(doc, ids, 5, 5))).toEqual([LOCAL]);
  });

  it("writes nothing when nothing moved", () => {
    const a = createElement(doc, rect);
    expect(recordUpdates(() => moveBy(doc, [a], 0, 0))).toEqual([]);
  });

  it("skips an id a peer deleted mid-drag", () => {
    const a = createElement(doc, rect);
    expect(() => moveBy(doc, [a, "gone"], 5, 5)).not.toThrow();
  });
});

describe("removeElements", () => {
  it("clears both the element and its place in the order", () => {
    const a = createElement(doc, rect);
    const b = createElement(doc, rect);
    removeElements(doc, [a]);
    expect(elements(doc).has(a)).toBe(false);
    expect(order(doc).toArray()).toEqual([b]);
  });

  // Deleting forwards would shift the indices under the loop.
  it("removes several at once without disturbing the survivors", () => {
    const ids = [
      createElement(doc, rect),
      createElement(doc, rect),
      createElement(doc, rect),
      createElement(doc, rect),
    ];
    removeElements(doc, [ids[0], ids[2]]);
    expect(order(doc).toArray()).toEqual([ids[1], ids[3]]);
  });

  it("is one update", () => {
    const ids = [createElement(doc, rect), createElement(doc, rect)];
    expect(recordUpdates(() => removeElements(doc, ids))).toEqual([LOCAL]);
  });
});

describe("appendPoints", () => {
  it("appends without rewriting what is already there", () => {
    const id = createElement(doc, { ...rect, kind: "path", w: 0, h: 0, points: [0, 0] });
    appendPoints(doc, id, [10, 20]);
    appendPoints(doc, id, [30, 40]);
    expect(pointsOf(elements(doc).get(id)!)?.toArray()).toEqual([0, 0, 10, 20, 30, 40]);
  });

  // The bbox is what hit-testing and selection read, so it has to keep up.
  it("grows the bounding box as the stroke goes", () => {
    const id = createElement(doc, { ...rect, kind: "path", w: 0, h: 0, points: [0, 0] });
    appendPoints(doc, id, [40, 90]);
    expect(readElement(id, elements(doc).get(id)!)).toMatchObject({ w: 40, h: 90 });
  });

  it("never shrinks the box on a backwards stroke", () => {
    const id = createElement(doc, { ...rect, kind: "path", w: 0, h: 0, points: [0, 0] });
    appendPoints(doc, id, [40, 90]);
    appendPoints(doc, id, [10, 10]);
    expect(readElement(id, elements(doc).get(id)!)).toMatchObject({ w: 40, h: 90 });
  });

  // A stroke drawn up and to the left produces negative samples. Tracking only
  // the far corner would leave half of it outside its own bounding box, and so
  // unselectable and un-hit-testable.
  it("grows the box backwards for a stroke drawn up and to the left", () => {
    const id = createElement(doc, { ...rect, kind: "path", w: 0, h: 0, points: [0, 0] });
    appendPoints(doc, id, [-30, -50]);

    const el = readElement(id, elements(doc).get(id)!);
    expect(el).toMatchObject({ bx: -30, by: -50, w: 30, h: 50 });
    expect(bboxOf(el)).toEqual({ x: -30, y: -50, w: 30, h: 50 });
  });

  it("spans a stroke that goes both ways", () => {
    const id = createElement(doc, { ...rect, kind: "path", w: 0, h: 0, points: [0, 0] });
    appendPoints(doc, id, [-20, 10]);
    appendPoints(doc, id, [40, -5]);

    expect(bboxOf(readElement(id, elements(doc).get(id)!))).toEqual({
      x: -20,
      y: -5,
      w: 60,
      h: 15,
    });
  });

  it("ignores an empty batch", () => {
    const id = createElement(doc, { ...rect, kind: "path", points: [0, 0] });
    expect(recordUpdates(() => appendPoints(doc, id, []))).toEqual([]);
  });
});

describe("replacePoints", () => {
  it("swaps the samples for the simplified set", () => {
    const id = createElement(doc, { ...rect, kind: "path", points: [0, 0, 1, 0, 2, 0] });
    replacePoints(doc, id, [0, 0, 2, 0]);
    expect(pointsOf(elements(doc).get(id)!)?.toArray()).toEqual([0, 0, 2, 0]);
  });
});

describe("resizeElement", () => {
  it("fits the element to the new box", () => {
    const id = createElement(doc, rect);
    resizeElement(doc, id, { x: 5, y: 5, w: 200, h: 80 });
    expect(readElement(id, elements(doc).get(id)!)).toMatchObject({
      x: 5,
      y: 5,
      w: 200,
      h: 80,
    });
  });

  it("scales a backwards stroke's box offsets too", () => {
    const id = createElement(doc, { ...rect, kind: "path", w: 0, h: 0, points: [0, 0] });
    appendPoints(doc, id, [-40, -20]);
    const before = bboxOf(readElement(id, elements(doc).get(id)!));

    resizeElement(doc, id, { x: before.x, y: before.y, w: 80, h: 20 });
    const after = readElement(id, elements(doc).get(id)!);
    expect(after).toMatchObject({ bx: -80, by: -20 });
  });

  // Path samples are relative to the origin, so they scale with the box.
  it("scales a stroke's samples with it", () => {
    const id = createElement(doc, {
      kind: "path",
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      points: [0, 0, 50, 100],
    });
    resizeElement(doc, id, { x: 0, y: 0, w: 200, h: 50 });
    expect(pointsOf(elements(doc).get(id)!)?.toArray()).toEqual([0, 0, 100, 50]);
  });
});

describe("updateElement", () => {
  it("patches only the keys given", () => {
    const id = createElement(doc, { ...rect, fill: "gray" });
    updateElement(doc, id, { fill: "mint" });
    expect(readElement(id, elements(doc).get(id)!)).toMatchObject({ fill: "mint", w: 100 });
  });

  it("does nothing for an element a peer already deleted", () => {
    expect(() => updateElement(doc, "gone", { fill: "mint" })).not.toThrow();
  });
});

describe("applyTextEdit", () => {
  const withText = () => {
    const id = createElement(doc, { ...rect, kind: "note", withText: true });
    return textOf(elements(doc).get(id)!)!;
  };

  it("writes the new string", () => {
    const text = withText();
    applyTextEdit(doc, text, "hello");
    expect(text.toString()).toBe("hello");
  });

  it("writes nothing when the text is unchanged", () => {
    const text = withText();
    applyTextEdit(doc, text, "hello");
    expect(recordUpdates(() => applyTextEdit(doc, text, "hello"))).toEqual([]);
  });

  it("handles an insert in the middle", () => {
    const text = withText();
    applyTextEdit(doc, text, "hello world");
    applyTextEdit(doc, text, "hello big world");
    expect(text.toString()).toBe("hello big world");
  });

  it("handles a delete in the middle", () => {
    const text = withText();
    applyTextEdit(doc, text, "hello big world");
    applyTextEdit(doc, text, "hello world");
    expect(text.toString()).toBe("hello world");
  });

  it("clears the whole string", () => {
    const text = withText();
    applyTextEdit(doc, text, "hello");
    applyTextEdit(doc, text, "");
    expect(text.toString()).toBe("");
  });

  // The reason this diffs rather than replacing: two people typing in one note
  // must both keep their characters. Replacing the string would lose one side.
  it("lets two people type in the same note without losing either", () => {
    const a = new Y.Doc();
    const id = createElement(a, { ...rect, kind: "note", withText: true });
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    const textA = textOf(elements(a).get(id)!)!;
    const textB = textOf(elements(b).get(id)!)!;
    applyTextEdit(a, textA, "hello");
    applyTextEdit(b, textB, "world");

    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));

    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toContain("hello");
    expect(textA.toString()).toContain("world");
  });
});
