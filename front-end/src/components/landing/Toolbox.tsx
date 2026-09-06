// The real §10.5 toolbar and the real §2.5 note palette, shown as themselves.
// Cheaper than drawing a picture of the product, and it can't drift out of date.

import {
  Circle,
  Hand,
  MousePointer2,
  PenLine,
  Slash,
  Square,
  StickyNote,
  Type,
} from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import { NOTE_COLORS } from "@/lib/presence-colors";

const TOOLS = [
  { icon: MousePointer2, label: "Select", key: "V" },
  { icon: Hand, label: "Pan", key: "H" },
  { icon: StickyNote, label: "Note", key: "N" },
  { icon: Type, label: "Text", key: "T" },
  { icon: Square, label: "Rectangle", key: "R" },
  { icon: Circle, label: "Circle", key: "O" },
  { icon: Slash, label: "Line", key: "L" },
  { icon: PenLine, label: "Pen", key: "P" },
];

// Where the toolbar's groups are divided (§10.5).
const DIVIDERS = new Set([2, 4]);

export function Toolbox() {
  return (
    <section className="shell">
      <Reveal className="rounded-lg border border-border bg-surface px-6 py-10 sm:px-10">
        <h2 className="text-lg text-ink">Eight tools, one row</h2>
        <p className="mt-3 max-w-measure text-base text-ink-secondary">
          The whole toolset sits in one pill at the bottom of the canvas, each
          tool on a single key. This is the real thing, drawn from the same
          design system as the board it belongs to.
        </p>

        <ul className="mt-8 flex flex-wrap items-center gap-1 rounded-pill border border-border bg-surface p-1.5 shadow-elev-2 sm:w-fit">
          {TOOLS.map((tool, index) => (
            <li key={tool.label} className="flex items-center">
              {DIVIDERS.has(index) ? (
                <span className="mx-1 h-6 w-px bg-wg-200" aria-hidden="true" />
              ) : null}
              <span
                className={
                  "flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm " +
                  (index === 2
                    ? "bg-accent-subtle text-accent-400"
                    : "text-ink-secondary")
                }
              >
                <tool.icon size={18} strokeWidth={1.5} aria-hidden="true" />
                {tool.label}
                <kbd className="ml-0.5 font-sans text-2xs text-ink-muted tabular-nums">
                  {tool.key}
                </kbd>
              </span>
            </li>
          ))}
        </ul>

        <h3 className="mt-10 text-base font-medium text-ink">Seven note colours</h3>
        <ul className="mt-3 flex flex-wrap gap-2">
          {NOTE_COLORS.map((color) => (
            <li
              key={color.name}
              className="size-8 rounded-note border border-black/8"
              style={{ backgroundColor: `light-dark(${color.light}, ${color.dark})` }}
            >
              <span className="sr-only">{color.name}</span>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
