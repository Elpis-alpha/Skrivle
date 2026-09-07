// STYLE_GUIDE.md §10.8 — rectangle, circle, line and arrow.
//
// Default is no fill and a 2px `--ink` stroke at `--radius-none`: ink has no
// corners. The fill picker can put a note-palette colour behind a shape, which
// is the only way a shape becomes solid.

import { bboxOf } from "@/lib/board/geometry";
import type { ElementSnapshot } from "@/lib/realtime/doc-schema";
import { NOTE_COLORS } from "@/lib/presence-colors";

export function strokePaint(stroke: ElementSnapshot["stroke"]): string {
  // §1 grants exactly two inks. --accent-500 rather than --accent so it still
  // reads at a 1px width.
  return stroke === "accent" ? "var(--accent-500)" : "var(--ink)";
}

export function fillPaint(fill: string | null): string {
  if (!fill) return "none";
  const color = NOTE_COLORS.find((c) => c.name === fill);
  return color ? `light-dark(${color.light}, ${color.dark})` : "none";
}

export function ShapeView({ el }: { el: ElementSnapshot }) {
  const box = bboxOf(el);
  const stroke = strokePaint(el.stroke);
  const fill = fillPaint(el.fill);

  // A line stores w/h as a delta, so its start is whichever corner of the box
  // it actually began at.
  const startX = el.w >= 0 ? 0 : -el.w;
  const startY = el.h >= 0 ? 0 : -el.h;

  return (
    <svg
      width={Math.max(box.w, 1)}
      height={Math.max(box.h, 1)}
      // The stroke is centred on the geometry, so half of it sits outside the
      // box. Clipping to the viewport would shave every outline in half.
      style={{ overflow: "visible" }}
      aria-hidden
    >
      {el.kind === "rect" ? (
        <rect
          x={0}
          y={0}
          width={box.w}
          height={box.h}
          fill={fill}
          stroke={stroke}
          strokeWidth={el.strokeWidth}
        />
      ) : null}

      {el.kind === "ellipse" ? (
        <ellipse
          cx={box.w / 2}
          cy={box.h / 2}
          rx={box.w / 2}
          ry={box.h / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={el.strokeWidth}
        />
      ) : null}

      {el.kind === "line" ? (
        <>
          <line
            x1={startX}
            y1={startY}
            x2={startX + el.w}
            y2={startY + el.h}
            stroke={stroke}
            strokeWidth={el.strokeWidth}
            strokeLinecap="round"
          />
          {el.arrow ? (
            <Arrowhead
              at={{ x: startX + el.w, y: startY + el.h }}
              from={{ x: startX, y: startY }}
              stroke={stroke}
              strokeWidth={el.strokeWidth}
            />
          ) : null}
        </>
      ) : null}
    </svg>
  );
}

function Arrowhead({
  at,
  from,
  stroke,
  strokeWidth,
}: {
  at: { x: number; y: number };
  from: { x: number; y: number };
  stroke: string;
  strokeWidth: number;
}) {
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  const length = Math.hypot(dx, dy);
  // A zero-length line has no direction to point in yet.
  if (length < 1) return null;

  // Grows with the stroke so a fat arrow doesn't end in a pinhead.
  const size = 8 + strokeWidth * 2;
  const angle = Math.atan2(dy, dx);
  const wing = (offset: number) => ({
    x: at.x - size * Math.cos(angle - offset),
    y: at.y - size * Math.sin(angle - offset),
  });
  const left = wing(Math.PI / 7);
  const right = wing(-Math.PI / 7);

  return (
    <path
      d={`M ${left.x} ${left.y} L ${at.x} ${at.y} L ${right.x} ${right.y}`}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}
