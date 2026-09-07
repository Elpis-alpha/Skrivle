"use client";

// What a pointer press does, given the tool that is active.
//
// Two clocks run through everything here. The person dragging must see 60fps,
// so the visible change is written straight onto the DOM every frame; peers do
// not need 60fps, so the document is only written every PUBLISH_MS. Doing both
// at animation rate would put ~120 WebSocket frames a second on the wire per
// person drawing — Socket.IO sends a binary event as two frames — and there is
// no rate limiting anywhere upstream to absorb it.

import { useCallback, useState, type RefObject } from "react";
import type * as Y from "yjs";
import {
  appendPoints,
  createElement,
  createNote,
  moveBy,
  pointsOf,
  readElement,
  replacePoints,
  resizeElement,
  orderedIds,
} from "./elements";
import {
  bboxOf,
  elementsInRect,
  handlePosition,
  HANDLES,
  normalizeRect,
  resizeRect,
  topmostAt,
  type Handle,
  type Point,
  type Rect,
} from "./geometry";
import { MAX_POINTS, simplify } from "./stroke";
import { elements, type ElementSnapshot } from "@/lib/realtime/doc-schema";
import { PUBLISH_MS } from "@/lib/realtime/board-session";
import type { BeginDrag, DragHandlers } from "./useBoardGestures";
import type { ToolAction, ToolState } from "./tools";
import type { ViewportStore } from "./viewport";

/** Below this, a drag was really a click, and the shape gets a sensible size. */
const CLICK_SLOP = 4;

/** What a click-not-drag gives a shape or text box. */
const DEFAULT_SHAPE = 120;
const DEFAULT_TEXT_WIDTH = 220;

/** How close to a handle counts as grabbing it, in screen pixels. */
const HANDLE_GRAB = 10;

export function useBoardTools({
  doc,
  hostRef,
  marqueeRef,
  store,
  state,
  dispatch,
  onGestureStart,
}: {
  doc: Y.Doc | null;
  hostRef: RefObject<HTMLElement | null>;
  /** Positioned imperatively during a marquee drag, so React never sees it move. */
  marqueeRef: RefObject<HTMLDivElement | null>;
  store: ViewportStore;
  state: ToolState;
  dispatch: (action: ToolAction) => void;
  /** Closes the open undo entry, so each gesture is exactly one Cmd+Z. */
  onGestureStart: () => void;
}): { begin: BeginDrag; draggingIds: readonly string[] } {
  // §10.7 — a note takes --elev-1 only while it is being dragged. State rather
  // than a ref because it has to reach the note, and it changes twice per drag
  // rather than per frame.
  const [draggingIds, setDraggingIds] = useState<readonly string[]>(NOTHING);

  const begin = useCallback<BeginDrag>(
    (start, event) => {
      const host = hostRef.current;
      if (!doc || doc.isDestroyed || !host) return null;

      onGestureStart();

      const { tool, style, selection } = state;
      const scale = store.getSnapshot().scale;

      const snapshots = (): ElementSnapshot[] => {
        const els = elements(doc);
        return orderedIds(doc)
          .map((id) => {
            const map = els.get(id);
            return map ? readElement(id, map) : null;
          })
          .filter((el): el is ElementSnapshot => el !== null);
      };

      const pointsFor = (id: string) => {
        const map = elements(doc).get(id);
        return map ? (pointsOf(map)?.toArray() ?? undefined) : undefined;
      };

      // --- Placing and drawing ------------------------------------------
      if (tool === "note") {
        const id = createNote(doc, start, { fill: style.fill, fontSize: style.fontSize });
        dispatch({ type: "created", id });
        // Straight into the text, because an empty note is not the point.
        dispatch({ type: "edit", id });
        return null;
      }

      if (tool === "pen") return beginStroke(doc, start, style, dispatch);

      if (tool === "rect" || tool === "ellipse" || tool === "line" || tool === "text") {
        return beginDrawOut(doc, start, tool, style, dispatch);
      }

      // --- Select --------------------------------------------------------
      const all = snapshots();

      // A handle beats everything under it: a resize grip on the edge of a note
      // sits over the note itself, and grabbing it must not just move the note.
      const handle = handleUnder(start, all, selection, scale);
      if (handle) {
        return beginResize(doc, handle.id, handle.handle, all);
      }

      const hit = topmostAt(all, start, scale, pointsFor);

      if (!hit) {
        dispatch({ type: "clear" });
        return beginMarquee(start, all, marqueeRef, store, dispatch);
      }

      const additive = event.shiftKey;
      const already = selection.includes(hit.id);

      if (additive) {
        dispatch({ type: "addToSelection", id: hit.id });
        // Shift-clicking is for building a selection, not for dragging it.
        return null;
      }

      // Dragging one of several selected elements moves the whole group;
      // pressing on an unselected one selects just it first.
      const moving = already && selection.length > 0 ? selection : [hit.id];
      if (!already) dispatch({ type: "select", ids: [hit.id] });

      setDraggingIds(moving);
      return beginMove(doc, moving, start, host, () => setDraggingIds(NOTHING));
    },
    [doc, hostRef, marqueeRef, store, state, dispatch, onGestureStart],
  );

  return { begin, draggingIds };
}

const NOTHING: readonly string[] = [];

/** Which resize handle, if any, the pointer is on. */
function handleUnder(
  point: Point,
  all: readonly ElementSnapshot[],
  selection: readonly string[],
  scale: number,
): { id: string; handle: Handle } | null {
  if (selection.length !== 1) return null;
  const el = all.find((candidate) => candidate.id === selection[0]);
  if (!el) return null;

  const box = bboxOf(el);
  const tolerance = HANDLE_GRAB / scale;

  // §10.8 — a line or arrow gets endpoint handles only, so there is nothing to
  // grab at the corners of a box it never really had.
  const handles: readonly Handle[] = el.kind === "line" ? ["nw", "se"] : HANDLES;

  for (const handle of handles) {
    const at = handlePosition(box, handle);
    if (Math.abs(point.x - at.x) <= tolerance && Math.abs(point.y - at.y) <= tolerance) {
      return { id: el.id, handle };
    }
  }
  return null;
}

/**
 * Move a selection.
 *
 * The elements follow the pointer every frame through a CSS transform, while
 * the document catches up on the slower cadence. When a flush lands, Yjs moves
 * the wrapper for real and the transform is zeroed in the same tick, so the two
 * never double-count.
 */
function beginMove(
  doc: Y.Doc,
  ids: readonly string[],
  start: Point,
  host: HTMLElement,
  onDone: () => void,
): DragHandlers {
  const nodes = ids
    .map((id) => host.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(id)}"]`))
    .filter((node): node is HTMLElement => node !== null);

  let total: Point = { x: 0, y: 0 };
  let flushed: Point = { x: 0, y: 0 };
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const paint = () => {
    frame = 0;
    const dx = total.x - flushed.x;
    const dy = total.y - flushed.y;
    for (const node of nodes) node.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const flush = () => {
    timer = null;
    const dx = Math.round(total.x - flushed.x);
    const dy = Math.round(total.y - flushed.y);
    if (dx === 0 && dy === 0) return;
    moveBy(doc, ids, dx, dy);
    flushed = { x: flushed.x + dx, y: flushed.y + dy };
    paint();
  };

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    if (timer) clearTimeout(timer);
    for (const node of nodes) node.style.transform = "";
    onDone();
  };

  return {
    move(point) {
      total = { x: point.x - start.x, y: point.y - start.y };
      if (!frame) frame = requestAnimationFrame(paint);
      if (!timer) timer = setTimeout(flush, PUBLISH_MS);
    },
    end() {
      if (frame) cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      flush();
      for (const node of nodes) node.style.transform = "";
      onDone();
    },
    cancel: stop,
  };
}

function beginResize(
  doc: Y.Doc,
  id: string,
  handle: Handle,
  all: readonly ElementSnapshot[],
): DragHandlers | null {
  const el = all.find((candidate) => candidate.id === id);
  if (!el) return null;
  const original = bboxOf(el);

  let latest: Rect = original;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    resizeElement(doc, id, latest);
  };

  return {
    move(point) {
      latest = resizeRect(original, handle, point);
      if (!timer) timer = setTimeout(flush, PUBLISH_MS);
    },
    end() {
      if (timer) clearTimeout(timer);
      flush();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      resizeElement(doc, id, original);
    },
  };
}

/** Rubber-band selection. Drawn straight onto the DOM — React never sees it move. */
function beginMarquee(
  start: Point,
  all: readonly ElementSnapshot[],
  marqueeRef: RefObject<HTMLDivElement | null>,
  store: ViewportStore,
  dispatch: (action: ToolAction) => void,
): DragHandlers {
  let box: Rect = { x: start.x, y: start.y, w: 0, h: 0 };
  let frame = 0;

  const paint = () => {
    frame = 0;
    const node = marqueeRef.current;
    if (!node) return;
    node.hidden = false;
    node.style.left = `${box.x}px`;
    node.style.top = `${box.y}px`;
    node.style.width = `${box.w}px`;
    node.style.height = `${box.h}px`;
  };

  const hide = () => {
    if (frame) cancelAnimationFrame(frame);
    const node = marqueeRef.current;
    if (node) node.hidden = true;
  };

  return {
    move(point) {
      box = normalizeRect(start, point);
      if (!frame) frame = requestAnimationFrame(paint);
    },
    end(point) {
      hide();
      const marquee = normalizeRect(start, point);
      // A click that never moved is a deselect, not a selection of nothing.
      const scale = store.getSnapshot().scale;
      if (marquee.w * scale < CLICK_SLOP && marquee.h * scale < CLICK_SLOP) return;
      dispatch({ type: "select", ids: elementsInRect(all, marquee).map((el) => el.id) });
    },
    cancel: hide,
  };
}

/** Rectangle, circle, line and text box: press, drag out, release. */
function beginDrawOut(
  doc: Y.Doc,
  start: Point,
  tool: "rect" | "ellipse" | "line" | "text",
  style: ToolState["style"],
  dispatch: (action: ToolAction) => void,
): DragHandlers {
  const id = createElement(doc, {
    kind: tool,
    x: start.x,
    y: start.y,
    w: 0,
    h: 0,
    fill: tool === "text" ? null : style.shapeFilled ? style.fill : null,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    fontSize: style.fontSize,
    arrow: tool === "line" && style.arrow,
    withText: tool === "text",
  });

  let latest: Rect = { x: start.x, y: start.y, w: 0, h: 0 };
  let timer: ReturnType<typeof setTimeout> | null = null;

  // A line keeps its direction: w/h are a delta from where it started, so
  // dragging up and left has to stay negative rather than being normalised.
  const write = (point: Point) => {
    resizeElement(
      doc,
      id,
      tool === "line"
        ? { x: start.x, y: start.y, w: point.x - start.x, h: point.y - start.y }
        : latest,
    );
  };

  return {
    move(point) {
      latest = normalizeRect(start, point);
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          write(point);
        }, PUBLISH_MS);
      }
    },
    end(point) {
      if (timer) clearTimeout(timer);
      const dragged = Math.hypot(point.x - start.x, point.y - start.y);

      if (dragged < CLICK_SLOP) {
        // Clicked rather than dragged: give it a usable size instead of a
        // zero-sized element nobody can find again.
        const size = tool === "text" ? { w: DEFAULT_TEXT_WIDTH, h: style.fontSize * 2 } : null;
        resizeElement(
          doc,
          id,
          tool === "line"
            ? { x: start.x, y: start.y, w: DEFAULT_SHAPE, h: 0 }
            : {
                x: start.x,
                y: start.y,
                w: size?.w ?? DEFAULT_SHAPE,
                h: size?.h ?? DEFAULT_SHAPE,
              },
        );
      } else {
        write(point);
      }

      dispatch({ type: "created", id });
      if (tool === "text") dispatch({ type: "edit", id });
    },
    cancel() {
      if (timer) clearTimeout(timer);
    },
  };
}

/** Freehand. Samples buffer locally and go out in batches. */
function beginStroke(
  doc: Y.Doc,
  start: Point,
  style: ToolState["style"],
  dispatch: (action: ToolAction) => void,
): DragHandlers {
  const id = createElement(doc, {
    kind: "path",
    x: start.x,
    y: start.y,
    w: 0,
    h: 0,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    points: [0, 0],
  });

  let buffer: number[] = [];
  let written = 1;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    if (buffer.length === 0) return;
    appendPoints(doc, id, buffer);
    written += buffer.length / 2;
    buffer = [];
  };

  return {
    move(_point, samples) {
      // Beyond the cap this is a runaway, not a drawing, and every sample still
      // costs bytes in the snapshot that gets rewritten every 30 seconds.
      if (written + buffer.length / 2 >= MAX_POINTS) return;
      for (const sample of samples) {
        buffer.push(Math.round(sample.x - start.x), Math.round(sample.y - start.y));
      }
      if (!timer) timer = setTimeout(flush, PUBLISH_MS);
    },
    end() {
      if (timer) clearTimeout(timer);
      flush();

      // The one rewrite a stroke gets: drop the samples that were never
      // carrying any shape, now that it is finished and nobody is watching it
      // grow.
      const map = elements(doc).get(id);
      const points = map ? pointsOf(map) : null;
      if (points && points.length >= 6) {
        const reduced = simplify(points.toArray());
        if (reduced.length < points.length) replacePoints(doc, id, reduced);
      }

      dispatch({ type: "created", id });
    },
    cancel() {
      if (timer) clearTimeout(timer);
      flush();
    },
  };
}
