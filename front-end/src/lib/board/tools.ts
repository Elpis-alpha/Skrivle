// The eight tools (§10.5) and the board's interaction state.
//
// Pure data and a reducer — no React, no icons. The icon for each tool lives in
// Toolbar.tsx, which is the single component both the board and the landing
// page render, so there is nowhere for the two to drift apart.

import type { ElementKind, StrokeColor, StrokeWidth } from "@/lib/realtime/doc-schema";

export type ToolId =
  | "select"
  | "pan"
  | "note"
  | "text"
  | "rect"
  | "ellipse"
  | "line"
  | "pen";

export type Tool = {
  id: ToolId;
  label: string;
  /** §10.5 shortcut. Uppercase; matching is case-insensitive. */
  key: string;
};

export const TOOLS: readonly Tool[] = [
  { id: "select", label: "Select", key: "V" },
  { id: "pan", label: "Pan", key: "H" },
  { id: "note", label: "Note", key: "N" },
  { id: "text", label: "Text", key: "T" },
  { id: "rect", label: "Rectangle", key: "R" },
  { id: "ellipse", label: "Circle", key: "O" },
  { id: "line", label: "Line", key: "L" },
  { id: "pen", label: "Pen", key: "P" },
] as const;

/** §10.5 groups: [select, hand] · [note, text] · [rectangle, circle, line, pen]. */
export const DIVIDERS = new Set([2, 4]);

const BY_KEY = new Map(TOOLS.map((tool) => [tool.key, tool.id]));

/** The tool a keystroke selects, or null if that key isn't a shortcut. */
export function toolForKey(key: string): ToolId | null {
  return BY_KEY.get(key.toUpperCase()) ?? null;
}

/** What a tool draws. Select and pan draw nothing. */
export function kindFor(tool: ToolId): ElementKind | null {
  switch (tool) {
    case "note": return "note";
    case "text": return "text";
    case "rect": return "rect";
    case "ellipse": return "ellipse";
    case "line": return "line";
    case "pen": return "path";
    default: return null;
  }
}

/** Tools you drag out to size, as opposed to clicking to place. */
export const isDragToDraw = (tool: ToolId): boolean =>
  tool === "rect" || tool === "ellipse" || tool === "line" || tool === "text";

/** The style the next element will be given, and what the picker edits (§10.6). */
export type BoardStyle = {
  /** A NOTE_COLORS name for notes; may be null for shapes, which default to no fill. */
  fill: string;
  stroke: StrokeColor;
  strokeWidth: StrokeWidth;
  fontSize: number;
  /** Whether the line tool draws an arrowhead. */
  arrow: boolean;
  /** Shapes are unfilled by default (§10.8); the picker can turn this on. */
  shapeFilled: boolean;
};

export const DEFAULT_STYLE: BoardStyle = {
  fill: "gray", // §2.5 — gray is the default for a new note.
  stroke: "ink",
  strokeWidth: 2,
  fontSize: 14,
  arrow: false,
  shapeFilled: false,
};

export type ToolState = {
  tool: ToolId;
  /** Element ids, in no particular order. */
  selection: readonly string[];
  /** The one element whose text is being edited, if any. */
  editingId: string | null;
  style: BoardStyle;
};

export const INITIAL_TOOL_STATE: ToolState = {
  tool: "select",
  selection: [],
  editingId: null,
  style: DEFAULT_STYLE,
};

export type ToolAction =
  | { type: "tool"; tool: ToolId }
  | { type: "select"; ids: readonly string[] }
  | { type: "addToSelection"; id: string }
  | { type: "clear" }
  | { type: "edit"; id: string | null }
  | { type: "style"; patch: Partial<BoardStyle> }
  | { type: "created"; id: string }
  | { type: "gone"; ids: readonly string[] };

export function toolReducer(state: ToolState, action: ToolAction): ToolState {
  switch (action.type) {
    case "tool":
      if (action.tool === state.tool) return state;
      // Picking up a different tool drops what was selected: the selection
      // handles belong to Select, and leaving them on top of a pen stroke in
      // progress is just noise.
      return { ...state, tool: action.tool, selection: [], editingId: null };

    case "select":
      return { ...state, selection: action.ids, editingId: null };

    case "addToSelection":
      return state.selection.includes(action.id)
        ? { ...state, selection: state.selection.filter((id) => id !== action.id) }
        : { ...state, selection: [...state.selection, action.id], editingId: null };

    case "clear":
      if (state.selection.length === 0 && state.editingId === null) return state;
      return { ...state, selection: [], editingId: null };

    case "edit":
      return {
        ...state,
        editingId: action.id,
        selection: action.id ? [action.id] : state.selection,
      };

    case "style":
      return { ...state, style: { ...state.style, ...action.patch } };

    case "created":
      // Drop back to Select with the new element chosen, so it can be moved,
      // resized or typed into straight away. The pen is the exception — you
      // draw several strokes in a row, and being thrown out after each one
      // would make it unusable.
      return state.tool === "pen"
        ? state
        : { ...state, tool: "select", selection: [action.id], editingId: null };

    case "gone": {
      const gone = new Set(action.ids);
      if (!state.selection.some((id) => gone.has(id))) {
        return state.editingId && gone.has(state.editingId)
          ? { ...state, editingId: null }
          : state;
      }
      return {
        ...state,
        selection: state.selection.filter((id) => !gone.has(id)),
        editingId: state.editingId && gone.has(state.editingId) ? null : state.editingId,
      };
    }
  }
}

/**
 * Which BoardStyle keys mean anything to which kind of element.
 *
 * A note is always filled and has no stroke; a shape has both but is unfilled
 * by default (§10.8); a pen stroke has no fill at all. Without this, changing
 * the stroke width with a note selected would also stamp the picker's current
 * fill onto it.
 */
const APPLIES: Record<ElementKind, ReadonlySet<keyof BoardStyle>> = {
  note: new Set(["fill", "fontSize"]),
  text: new Set(["stroke", "fontSize"]),
  rect: new Set(["fill", "shapeFilled", "stroke", "strokeWidth"]),
  ellipse: new Set(["fill", "shapeFilled", "stroke", "strokeWidth"]),
  line: new Set(["stroke", "strokeWidth", "arrow"]),
  path: new Set(["stroke", "strokeWidth"]),
};

/**
 * The element fields a style change should write, for one kind.
 *
 * Only what the change actually touched: applying the whole style every time
 * would silently repaint a butter note grey the moment someone nudged the
 * stroke width.
 */
export function styleFieldsFor(
  kind: ElementKind,
  patch: Partial<BoardStyle>,
  resolved: BoardStyle,
): Record<string, unknown> {
  const applies = APPLIES[kind];
  const out: Record<string, unknown> = {};

  if (patch.stroke !== undefined && applies.has("stroke")) out.stroke = patch.stroke;
  if (patch.strokeWidth !== undefined && applies.has("strokeWidth")) {
    out.strokeWidth = patch.strokeWidth;
  }
  if (patch.fontSize !== undefined && applies.has("fontSize")) out.fontSize = patch.fontSize;
  if (patch.arrow !== undefined && applies.has("arrow")) out.arrow = patch.arrow;

  if ((patch.fill !== undefined || patch.shapeFilled !== undefined) && applies.has("fill")) {
    // A note is always filled; a shape only when the picker says so.
    out.fill = kind === "note" ? resolved.fill : resolved.shapeFilled ? resolved.fill : null;
  }

  return out;
}
