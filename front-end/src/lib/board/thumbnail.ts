"use client";

// Rendering the board to a picture for the My Boards tile (§10.15).
//
// Drawn to a canvas from the document rather than screenshotting the DOM: the
// board on screen is a camera onto an unbounded space, and a tile wants the
// work, framed, not whatever happened to be in view.
//
// Cloudinary crops the delivered image 16:10 from the north-west
// (back-end/src/media/cloudinary.ts), so this renders at that ratio and biases
// content to the top-left — anything else would be cropped inconsistently.

import type * as Y from "yjs";
import { NOTE_COLORS } from "@/lib/presence-colors";
import { elements, type ElementSnapshot } from "@/lib/realtime/doc-schema";
import { orderedIds, pointsOf, readElement, textOf } from "./elements";
import { bboxOf, unionRects } from "./geometry";
import { toPathData } from "./stroke";

/** 16:10 at 2x the 480px Cloudinary delivers, so the tile stays sharp. */
export const THUMB_WIDTH = 960;
export const THUMB_HEIGHT = 600;

/** Breathing room around the work, in board units before scaling. */
const PADDING = 40;

/** Never blow a tiny board up to illegibility. */
const MAX_SCALE = 1;

/**
 * Draw the board. Returns null when there is nothing worth a picture — an empty
 * board should keep the "no thumbnail yet" tile rather than get a blank one.
 */
export function renderThumbnail(doc: Y.Doc): HTMLCanvasElement | null {
  const els = elements(doc);
  const ids = orderedIds(doc);
  if (ids.length === 0) return null;

  const snapshots = ids
    .map((id) => {
      const map = els.get(id);
      return map ? ({ el: readElement(id, map), map } as const) : null;
    })
    .filter((entry): entry is { el: ElementSnapshot; map: Y.Map<unknown> } => entry !== null);

  const content = unionRects(snapshots.map((entry) => bboxOf(entry.el)));
  if (!content) return null;

  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;

  ctx.fillStyle = token("--canvas-bg", "#FAF9F7");
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

  const scale = Math.min(
    MAX_SCALE,
    THUMB_WIDTH / (content.w + PADDING * 2),
    THUMB_HEIGHT / (content.h + PADDING * 2),
  );

  ctx.save();
  // North-west bias: the crop anchors there, so the work starts at the padding
  // rather than being centred and losing its edges.
  ctx.translate(PADDING * scale - content.x * scale, PADDING * scale - content.y * scale);
  ctx.scale(scale, scale);

  const ink = token("--ink", "#1E1428");
  const accent = token("--accent-500", "#5C2E86");

  for (const { el, map } of snapshots) {
    const box = bboxOf(el);
    const stroke = el.stroke === "accent" ? accent : ink;
    const fill = NOTE_COLORS.find((color) => color.name === el.fill);

    ctx.lineWidth = el.strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (el.kind) {
      case "note": {
        ctx.fillStyle = fill?.light ?? NOTE_COLORS[0].light;
        ctx.fillRect(box.x, box.y, box.w, box.h);
        drawText(ctx, textOf(map)?.toString() ?? "", box, el.fontSize, ink);
        break;
      }
      case "text":
        drawText(ctx, textOf(map)?.toString() ?? "", box, el.fontSize, stroke);
        break;
      case "rect":
        if (fill) {
          ctx.fillStyle = fill.light;
          ctx.fillRect(box.x, box.y, box.w, box.h);
        }
        ctx.strokeRect(box.x, box.y, box.w, box.h);
        break;
      case "ellipse":
        ctx.beginPath();
        ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
        if (fill) {
          ctx.fillStyle = fill.light;
          ctx.fill();
        }
        ctx.stroke();
        break;
      case "line":
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(el.x + el.w, el.y + el.h);
        ctx.stroke();
        break;
      case "path": {
        const samples = pointsOf(map)?.toArray() ?? [];
        const data = toPathData(samples);
        if (!data) break;
        ctx.save();
        ctx.translate(el.x, el.y);
        ctx.stroke(new Path2D(data));
        ctx.restore();
        break;
      }
    }
  }

  ctx.restore();
  return canvas;
}

/** Wrapped, clipped to the element, and never more lines than fit. */
function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: { x: number; y: number; w: number; h: number },
  fontSize: number,
  color: string,
): void {
  if (!text) return;

  const padding = 12;
  const lineHeight = fontSize * 1.45;
  const maxWidth = box.w - padding * 2;
  if (maxWidth <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.font = `400 ${fontSize}px Poppins, system-ui, sans-serif`;
  ctx.textBaseline = "top";

  let y = box.y + padding;
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        ctx.fillText(line, box.x + padding, y);
        y += lineHeight;
        line = word;
      } else {
        line = candidate;
      }
      if (y > box.y + box.h) break;
    }
    if (line && y <= box.y + box.h) {
      ctx.fillText(line, box.x + padding, y);
      y += lineHeight;
    }
  }

  ctx.restore();
}

export function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
