import { describe, expect, it } from "vitest";
import type { ElementSnapshot } from "@/lib/realtime/doc-schema";
import {
  bboxOf,
  distanceToPolyline,
  distanceToSegment,
  elementsInRect,
  handlePosition,
  hitTest,
  MIN_SIZE,
  normalizeRect,
  rectsIntersect,
  resizeRect,
  toleranceFor,
  topmostAt,
  unionRects,
} from "./geometry";

const el = (over: Partial<ElementSnapshot> & Pick<ElementSnapshot, "kind">): ElementSnapshot => ({
  id: "e1",
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  bx: 0,
  by: 0,
  fill: null,
  stroke: "ink",
  strokeWidth: 2,
  fontSize: 14,
  arrow: false,
  ...over,
});

describe("normalizeRect", () => {
  it("orders the corners whichever way the drag went", () => {
    expect(normalizeRect({ x: 30, y: 40 }, { x: 10, y: 10 })).toEqual({
      x: 10,
      y: 10,
      w: 20,
      h: 30,
    });
  });
});

describe("bboxOf", () => {
  it("leaves a positive box alone", () => {
    expect(bboxOf({ x: 5, y: 5, w: 10, h: 20 })).toEqual({ x: 5, y: 5, w: 10, h: 20 });
  });

  // A path's box can begin before its anchor, because its samples are relative
  // to the first point and a stroke can go up and to the left.
  it("shifts a path's box by its anchor offset", () => {
    expect(bboxOf({ kind: "path", x: 100, y: 100, w: 30, h: 50, bx: -30, by: -50 })).toEqual({
      x: 70,
      y: 50,
      w: 30,
      h: 50,
    });
  });

  // A line stores w/h as a delta from its start, so both may be negative.
  it("normalises a line drawn up and to the left", () => {
    expect(bboxOf({ x: 100, y: 100, w: -40, h: -60 })).toEqual({
      x: 60,
      y: 40,
      w: 40,
      h: 60,
    });
  });
});

describe("unionRects", () => {
  it("is null for nothing, so an empty selection has no box", () => {
    expect(unionRects([])).toBeNull();
  });

  it("spans every rect it is given", () => {
    expect(
      unionRects([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 50, y: 20, w: 10, h: 10 },
      ]),
    ).toEqual({ x: 0, y: 0, w: 60, h: 30 });
  });
});

describe("distanceToSegment", () => {
  it("projects onto the segment", () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });

  it("clamps past the ends rather than onto the infinite line", () => {
    expect(distanceToSegment({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10);
  });

  // Would divide by zero without the guard.
  it("treats a zero-length segment as a point", () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe("distanceToPolyline", () => {
  // Points are stored relative to the element so moving a stroke is two field
  // writes instead of rewriting every number.
  it("offsets the points by the element origin", () => {
    const points = [0, 0, 100, 0];
    expect(distanceToPolyline({ x: 50, y: 15 }, points, { x: 0, y: 10 })).toBe(5);
  });

  it("is Infinity for a polyline with no points", () => {
    expect(distanceToPolyline({ x: 0, y: 0 }, [], { x: 0, y: 0 })).toBe(Infinity);
  });

  it("handles a single point", () => {
    expect(distanceToPolyline({ x: 3, y: 4 }, [0, 0], { x: 0, y: 0 })).toBe(5);
  });
});

describe("toleranceFor", () => {
  // The whole point: a 2px stroke at 25% zoom is otherwise a half-pixel target.
  it("grows as you zoom out so nothing becomes unclickable", () => {
    expect(toleranceFor({ strokeWidth: 2 }, 0.25)).toBe(24);
  });

  it("never falls below half the stroke, however far you zoom in", () => {
    expect(toleranceFor({ strokeWidth: 8 }, 4)).toBe(4);
  });
});

describe("hitTest", () => {
  it("counts anywhere inside a note", () => {
    expect(hitTest(el({ kind: "note" }), { x: 50, y: 50 }, 1)).toBe(true);
  });

  it("misses outside a note", () => {
    expect(hitTest(el({ kind: "note" }), { x: 500, y: 50 }, 1)).toBe(false);
  });

  // §10.8 shapes have no fill, so the hollow middle must NOT be a hit — that is
  // what lets you click a note through the middle of a rectangle over it.
  it("ignores the hollow middle of an unfilled rectangle", () => {
    expect(hitTest(el({ kind: "rect" }), { x: 50, y: 50 }, 1)).toBe(false);
  });

  it("hits the edge of an unfilled rectangle", () => {
    expect(hitTest(el({ kind: "rect" }), { x: 50, y: 1 }, 1)).toBe(true);
  });

  it("counts the middle once the rectangle is filled", () => {
    expect(hitTest(el({ kind: "rect", fill: "butter" }), { x: 50, y: 50 }, 1)).toBe(true);
  });

  it("ignores the hollow middle of an unfilled ellipse", () => {
    expect(hitTest(el({ kind: "ellipse" }), { x: 50, y: 50 }, 1)).toBe(false);
  });

  it("hits an unfilled ellipse on its outline", () => {
    expect(hitTest(el({ kind: "ellipse" }), { x: 50, y: 0 }, 1)).toBe(true);
  });

  it("counts the middle once the ellipse is filled", () => {
    expect(hitTest(el({ kind: "ellipse", fill: "sky" }), { x: 50, y: 50 }, 1)).toBe(true);
  });

  it("misses the corner of a filled ellipse, which is outside the curve", () => {
    expect(hitTest(el({ kind: "ellipse", fill: "sky" }), { x: 2, y: 2 }, 1)).toBe(false);
  });

  it("hits along a line but not beside it", () => {
    const line = el({ kind: "line", w: 100, h: 100 });
    expect(hitTest(line, { x: 50, y: 50 }, 1)).toBe(true);
    expect(hitTest(line, { x: 20, y: 80 }, 1)).toBe(false);
  });

  it("hits a path near its stroke", () => {
    const path = el({ kind: "path", w: 100, h: 0 });
    expect(hitTest(path, { x: 50, y: 2 }, 1, [0, 0, 100, 0])).toBe(true);
    expect(hitTest(path, { x: 50, y: 60 }, 1, [0, 0, 100, 0])).toBe(false);
  });
});

describe("topmostAt", () => {
  // The last thing painted is the first thing you can grab.
  it("returns the last matching element in paint order", () => {
    const under = el({ id: "under", kind: "note" });
    const over = el({ id: "over", kind: "note" });
    expect(topmostAt([under, over], { x: 50, y: 50 }, 1)?.id).toBe("over");
  });

  it("is null when nothing is under the pointer", () => {
    expect(topmostAt([el({ kind: "note" })], { x: 900, y: 900 }, 1)).toBeNull();
  });
});

describe("elementsInRect", () => {
  // Marquee: touching is enough, full enclosure is not required.
  it("takes everything the marquee overlaps", () => {
    const a = el({ id: "a", kind: "note", x: 0, y: 0, w: 50, h: 50 });
    const b = el({ id: "b", kind: "note", x: 400, y: 400, w: 50, h: 50 });
    const hit = elementsInRect([a, b], { x: 40, y: 40, w: 20, h: 20 });
    expect(hit.map((e) => e.id)).toEqual(["a"]);
  });
});

describe("rectsIntersect", () => {
  it("counts a shared edge as touching", () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(
      true,
    );
  });

  it("is false when they are apart", () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 })).toBe(
      false,
    );
  });
});

describe("handlePosition", () => {
  it("places the eight handles around the box", () => {
    const r = { x: 0, y: 0, w: 100, h: 60 };
    expect(handlePosition(r, "nw")).toEqual({ x: 0, y: 0 });
    expect(handlePosition(r, "se")).toEqual({ x: 100, y: 60 });
    expect(handlePosition(r, "n")).toEqual({ x: 50, y: 0 });
    expect(handlePosition(r, "w")).toEqual({ x: 0, y: 30 });
  });
});

describe("resizeRect", () => {
  const r = { x: 0, y: 0, w: 100, h: 100 };

  it("moves only the dragged corner", () => {
    expect(resizeRect(r, "se", { x: 140, y: 130 })).toEqual({ x: 0, y: 0, w: 140, h: 130 });
  });

  it("moves the origin when dragging the top-left", () => {
    expect(resizeRect(r, "nw", { x: 20, y: 30 })).toEqual({ x: 20, y: 30, w: 80, h: 70 });
  });

  it("leaves the other axis untouched on an edge handle", () => {
    expect(resizeRect(r, "e", { x: 50, y: 999 })).toEqual({ x: 0, y: 0, w: 50, h: 100 });
  });

  // Flipping inside out mid-drag is disorienting, and §10.7 gives notes a
  // minimum size regardless.
  it("clamps at MIN_SIZE rather than flipping through zero", () => {
    expect(resizeRect(r, "e", { x: -500, y: 0 })).toEqual({ x: 0, y: 0, w: MIN_SIZE, h: 100 });
    expect(resizeRect(r, "nw", { x: 500, y: 500 })).toEqual({
      x: 100 - MIN_SIZE,
      y: 100 - MIN_SIZE,
      w: MIN_SIZE,
      h: MIN_SIZE,
    });
  });
});
