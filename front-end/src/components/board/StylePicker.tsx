"use client";

// STYLE_GUIDE.md §10.6 — colour / stroke picker.
//
// "Row of the 7 note-palette swatches (§2.5) for fills, plus --ink and
// --accent-500 for strokes. Selected swatch has a 2px --ink ring. Stroke-width
// segmented control: 1 / 2 / 4 / 8px."
//
// Exactly two stroke inks, and that is the point rather than an omission: §1
// spends the amethyst on the primary action and your own presence, and grants
// these two as the only colours a user's own marks may be drawn in.

import { useEffect, useRef, useState } from "react";
import { Check, MoveRight } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { NOTE_COLORS } from "@/lib/presence-colors";
import { STROKE_WIDTHS, type StrokeColor, type StrokeWidth } from "@/lib/realtime/doc-schema";
import type { BoardStyle } from "@/lib/board/tools";
import { fillPaint, strokePaint } from "./elements/ShapeView";

const STROKE_LABEL: Record<StrokeColor, string> = { ink: "Ink", accent: "Amethyst" };

export function StylePicker({
  style,
  onChange,
}: {
  style: BoardStyle;
  onChange: (patch: Partial<BoardStyle>) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative flex items-center">
      <Tooltip label="Colour and stroke">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Colour and stroke"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          className={
            "grid size-9 place-items-center rounded-sm transition-colors " +
            "duration-(--dur-base) ease-standard hover:bg-wg-50 focus-visible:focus-ring " +
            "pointer-coarse:size-11"
          }
        >
          <span
            className="size-5 rounded-note border border-border"
            style={{
              backgroundColor:
                style.shapeFilled || style.fill ? fillPaint(style.fill) : "transparent",
              // The swatch shows what the next mark will look like: its fill if
              // it has one, and always the ink it will be drawn in.
              boxShadow: `inset 0 0 0 2px ${strokePaint(style.stroke)}`,
            }}
          />
        </button>
      </Tooltip>

      {open ? (
        <div
          role="dialog"
          aria-label="Colour and stroke"
          className={
            "absolute bottom-full left-1/2 mb-3 w-64 -translate-x-1/2 rounded-md " +
            "border border-border bg-surface p-2 shadow-elev-2"
          }
        >
          <Row label="Fill">
            {NOTE_COLORS.map((color) => (
              <Swatch
                key={color.name}
                label={color.name}
                selected={style.shapeFilled && style.fill === color.name}
                onClick={() => onChange({ fill: color.name, shapeFilled: true })}
                style={{ backgroundColor: `light-dark(${color.light}, ${color.dark})` }}
              />
            ))}
            <Swatch
              label="No fill"
              selected={!style.shapeFilled}
              onClick={() => onChange({ shapeFilled: false })}
              // A diagonal rule is the conventional "nothing here", and it
              // reads without relying on colour (§12).
              style={{
                backgroundImage:
                  "linear-gradient(to top right, transparent 46%, var(--ink-muted) 46%, var(--ink-muted) 54%, transparent 54%)",
              }}
            />
          </Row>

          <Row label="Stroke">
            {(["ink", "accent"] as const).map((stroke) => (
              <Swatch
                key={stroke}
                label={STROKE_LABEL[stroke]}
                selected={style.stroke === stroke}
                onClick={() => onChange({ stroke })}
                style={{ backgroundColor: strokePaint(stroke) }}
              />
            ))}
          </Row>

          <Row label="Width">
            <div className="flex items-center gap-1 rounded-sm bg-wg-50 p-0.5">
              {STROKE_WIDTHS.map((width) => (
                <button
                  key={width}
                  type="button"
                  aria-pressed={style.strokeWidth === width}
                  aria-label={`${width} pixel stroke`}
                  onClick={() => onChange({ strokeWidth: width as StrokeWidth })}
                  className={
                    "grid h-7 w-9 place-items-center rounded-sm transition-colors " +
                    "duration-(--dur-fast) ease-standard focus-visible:focus-ring " +
                    (style.strokeWidth === width ? "bg-surface shadow-elev-1" : "hover:bg-wg-100")
                  }
                >
                  <span
                    className="w-5 rounded-pill bg-ink"
                    style={{ height: Math.min(width, 6) }}
                  />
                </button>
              ))}
            </div>
          </Row>

          <Row label="Line">
            <button
              type="button"
              aria-pressed={style.arrow}
              onClick={() => onChange({ arrow: !style.arrow })}
              className={
                "flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs transition-colors " +
                "duration-(--dur-fast) ease-standard focus-visible:focus-ring " +
                (style.arrow
                  ? "bg-accent-subtle text-accent-400"
                  : "text-ink-secondary hover:bg-wg-50")
              }
            >
              <MoveRight size={16} strokeWidth={1.5} aria-hidden />
              Arrowhead
              {style.arrow ? <Check size={14} strokeWidth={2} aria-hidden /> : null}
            </button>
          </Row>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-1 py-1.5">
      <p className="mb-1.5 text-2xs text-ink-muted">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function Swatch({
  label,
  selected,
  onClick,
  style,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  style: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      // §10.6 — the selected swatch takes a 2px --ink ring. Offset so the ring
      // reads as a ring rather than thickening the swatch.
      className={
        "size-6 rounded-note border border-black/8 transition-shadow " +
        "duration-(--dur-fast) ease-standard focus-visible:focus-ring " +
        (selected ? "ring-2 ring-ink ring-offset-1 ring-offset-surface" : "")
      }
      style={style}
    />
  );
}
