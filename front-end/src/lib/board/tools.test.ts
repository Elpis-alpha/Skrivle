import { describe, expect, it } from "vitest";
import {
  DEFAULT_STYLE,
  styleFieldsFor,
  DIVIDERS,
  INITIAL_TOOL_STATE,
  isDragToDraw,
  kindFor,
  toolForKey,
  toolReducer,
  TOOLS,
  type ToolState,
} from "./tools";

const run = (state: ToolState, ...actions: Parameters<typeof toolReducer>[1][]) =>
  actions.reduce(toolReducer, state);

describe("TOOLS", () => {
  // The landing page publicly promises "Eight tools, one row".
  it("is the eight tools §10.5 names", () => {
    expect(TOOLS).toHaveLength(8);
    expect(TOOLS.map((t) => t.id)).toEqual([
      "select",
      "pan",
      "note",
      "text",
      "rect",
      "ellipse",
      "line",
      "pen",
    ]);
  });

  it("carries the §10.5 shortcut keys", () => {
    expect(TOOLS.map((t) => t.key).join("")).toBe("VHNTROLP");
  });

  it("has no duplicate shortcut", () => {
    expect(new Set(TOOLS.map((t) => t.key)).size).toBe(TOOLS.length);
  });

  it("splits the groups where §10.5 says", () => {
    expect([...DIVIDERS].sort()).toEqual([2, 4]);
  });
});

describe("toolForKey", () => {
  it("matches regardless of case, since Shift is not part of the shortcut", () => {
    expect(toolForKey("n")).toBe("note");
    expect(toolForKey("N")).toBe("note");
  });

  it("is null for a key that is not a tool", () => {
    expect(toolForKey("z")).toBeNull();
  });
});

describe("kindFor", () => {
  it("maps each drawing tool to the kind it writes", () => {
    expect(kindFor("note")).toBe("note");
    expect(kindFor("ellipse")).toBe("ellipse");
    expect(kindFor("pen")).toBe("path");
  });

  it("is null for the two modes that draw nothing", () => {
    expect(kindFor("select")).toBeNull();
    expect(kindFor("pan")).toBeNull();
  });
});

describe("isDragToDraw", () => {
  it("is true for the tools you drag out to size", () => {
    expect(isDragToDraw("rect")).toBe(true);
    expect(isDragToDraw("line")).toBe(true);
  });

  // A note is placed at its §10.7 minimum size on a single click.
  it("is false for the note and the pen", () => {
    expect(isDragToDraw("note")).toBe(false);
    expect(isDragToDraw("pen")).toBe(false);
  });
});

describe("toolReducer", () => {
  it("starts on Select with nothing chosen", () => {
    expect(INITIAL_TOOL_STATE).toMatchObject({
      tool: "select",
      selection: [],
      editingId: null,
      style: DEFAULT_STYLE,
    });
  });

  it("drops the selection when a different tool is picked up", () => {
    const state = run(INITIAL_TOOL_STATE, { type: "select", ids: ["a", "b"] }, {
      type: "tool",
      tool: "pen",
    });
    expect(state).toMatchObject({ tool: "pen", selection: [], editingId: null });
  });

  it("is a no-op when the same tool is picked again", () => {
    const selected = run(INITIAL_TOOL_STATE, { type: "select", ids: ["a"] });
    expect(run(selected, { type: "tool", tool: "select" })).toBe(selected);
  });

  it("toggles an id in and out of the selection", () => {
    const one = run(INITIAL_TOOL_STATE, { type: "addToSelection", id: "a" });
    expect(one.selection).toEqual(["a"]);
    const two = run(one, { type: "addToSelection", id: "b" });
    expect(two.selection).toEqual(["a", "b"]);
    expect(run(two, { type: "addToSelection", id: "a" }).selection).toEqual(["b"]);
  });

  it("keeps the same object when clearing an already-empty selection", () => {
    expect(run(INITIAL_TOOL_STATE, { type: "clear" })).toBe(INITIAL_TOOL_STATE);
  });

  it("selects the element it starts editing", () => {
    const state = run(INITIAL_TOOL_STATE, { type: "edit", id: "a" });
    expect(state).toMatchObject({ editingId: "a", selection: ["a"] });
  });

  it("stops editing without dropping the selection", () => {
    const state = run(INITIAL_TOOL_STATE, { type: "edit", id: "a" }, { type: "edit", id: null });
    expect(state).toMatchObject({ editingId: null, selection: ["a"] });
  });

  it("patches only the style keys given", () => {
    const state = run(INITIAL_TOOL_STATE, { type: "style", patch: { strokeWidth: 8 } });
    expect(state.style).toMatchObject({ strokeWidth: 8, fill: DEFAULT_STYLE.fill });
  });

  // Placing a note and being unable to type into it would be absurd.
  it("returns to Select with the new element chosen after drawing one", () => {
    const state = run(INITIAL_TOOL_STATE, { type: "tool", tool: "note" }, {
      type: "created",
      id: "n1",
    });
    expect(state).toMatchObject({ tool: "select", selection: ["n1"] });
  });

  // You draw several strokes in a row; being thrown out after each is unusable.
  it("stays on the pen after a stroke", () => {
    const drawing = run(INITIAL_TOOL_STATE, { type: "tool", tool: "pen" });
    expect(run(drawing, { type: "created", id: "s1" })).toBe(drawing);
  });

  it("prunes elements a peer deleted out of the selection", () => {
    const state = run(INITIAL_TOOL_STATE, { type: "select", ids: ["a", "b", "c"] }, {
      type: "gone",
      ids: ["b"],
    });
    expect(state.selection).toEqual(["a", "c"]);
  });

  it("stops editing an element a peer deleted underneath us", () => {
    const state = run(INITIAL_TOOL_STATE, { type: "edit", id: "a" }, {
      type: "gone",
      ids: ["a"],
    });
    expect(state).toMatchObject({ editingId: null, selection: [] });
  });

  it("does not churn state when the deletion touched nothing selected", () => {
    const selected = run(INITIAL_TOOL_STATE, { type: "select", ids: ["a"] });
    expect(run(selected, { type: "gone", ids: ["z"] })).toBe(selected);
  });
});

describe("styleFieldsFor", () => {
  const style = { ...DEFAULT_STYLE, fill: "butter", stroke: "accent" as const, strokeWidth: 4 as const };

  it("writes only what the change touched", () => {
    expect(styleFieldsFor("rect", { strokeWidth: 8 }, { ...style, strokeWidth: 8 })).toEqual({
      strokeWidth: 8,
    });
  });

  // The reason this is not "apply the whole style": nudging the stroke width
  // with a butter note selected must not repaint it grey.
  it("leaves a note's fill alone when only the stroke width changed", () => {
    expect(styleFieldsFor("note", { strokeWidth: 8 }, style)).toEqual({});
  });

  it("gives a note the fill and font size, which are all it has", () => {
    expect(styleFieldsFor("note", { fill: "mint" }, { ...style, fill: "mint" })).toEqual({
      fill: "mint",
    });
    expect(styleFieldsFor("note", { stroke: "ink" }, style)).toEqual({});
  });

  // §10.8 — shapes are unfilled by default, and the picker is what turns that on.
  it("only fills a shape when the picker says it is filled", () => {
    expect(styleFieldsFor("rect", { fill: "sky" }, { ...style, fill: "sky", shapeFilled: true })).toEqual({
      fill: "sky",
    });
    expect(
      styleFieldsFor("rect", { shapeFilled: false }, { ...style, shapeFilled: false }),
    ).toEqual({ fill: null });
  });

  it("gives a line its arrowhead and nothing else its arrowhead", () => {
    expect(styleFieldsFor("line", { arrow: true }, { ...style, arrow: true })).toEqual({
      arrow: true,
    });
    expect(styleFieldsFor("rect", { arrow: true }, { ...style, arrow: true })).toEqual({});
  });

  it("gives a stroke its ink and width, but never a fill", () => {
    expect(
      styleFieldsFor("path", { stroke: "accent", fill: "rose" }, { ...style, fill: "rose" }),
    ).toEqual({ stroke: "accent" });
  });

  it("sizes text without trying to fill it", () => {
    expect(styleFieldsFor("text", { fontSize: 24, fill: "rose" }, { ...style, fontSize: 24 })).toEqual({
      fontSize: 24,
    });
  });
});
