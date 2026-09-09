"use client";

// STYLE_GUIDE.md §10.5 — the floating toolbar.
//
// One component for two surfaces: the real board renders it live, and the
// landing page renders it read-only as its own illustration. That is the point
// — a picture of the toolbar would go stale, and this cannot.

import { useState } from "react";
import {
  Circle,
  Hand,
  MousePointer2,
  PenLine,
  Slash,
  Square,
  StickyNote,
  Type,
  Wrench,
} from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { CHROME_ATTR } from "@/lib/board/useBoardGestures";
import { DIVIDERS, TOOLS, type BoardStyle, type ToolId } from "@/lib/board/tools";
import { StylePicker } from "./StylePicker";

/** §8 — Lucide, 1.5px stroke. The one place a tool's icon is chosen. */
const ICONS: Record<ToolId, typeof Circle> = {
  select: MousePointer2,
  pan: Hand,
  note: StickyNote,
  text: Type,
  rect: Square,
  ellipse: Circle,
  line: Slash,
  pen: PenLine,
};

/** §8 — in-toolbar tool icons render at 20px. */
const ICON_SIZE = 20;

/** §10.5 — active tool: --accent-subtle bg, --accent-400 icon, --radius-sm. */
const ACTIVE = "bg-accent-subtle text-accent-400";
const IDLE = "text-ink-secondary hover:bg-wg-50 hover:text-ink";

const BUTTON =
  "grid size-9 place-items-center rounded-sm transition-colors duration-(--dur-base) " +
  "ease-standard focus-visible:focus-ring pointer-coarse:size-11";

export function Toolbar({
  value,
  onChange,
  style,
  onStyleChange,
  readOnly = false,
}: {
  value: ToolId;
  onChange?: (tool: ToolId) => void;
  style?: BoardStyle;
  onStyleChange?: (patch: Partial<BoardStyle>) => void;
  /**
   * The landing page's copy: the same pill, but nothing to press.
   *
   * Labels and keys are spelled out rather than hidden behind tooltips, because
   * there is nothing to hover — and being able to read them is the whole reason
   * the marketing page shows the toolbar at all.
   */
  readOnly?: boolean;
}) {
  // §10.5 — "collapses to an icon that opens the full pill below 480px width".
  const [expanded, setExpanded] = useState(false);

  const pill = (
    <div
      {...(readOnly ? {} : { [CHROME_ATTR]: "" })}
      role={readOnly ? undefined : "toolbar"}
      aria-label={readOnly ? undefined : "Drawing tools"}
      aria-orientation="horizontal"
      // rounded-pill (999px) on a single row reads as a capsule; on a row this
      // narrow the tools don't all fit and the pill wraps to two rows (or more
      // for the labelled readOnly copy), and that same 999px radius on a much
      // taller box looks like an oversized, lopsided blob rather than rounded
      // corners. 480px is reused rather than measured — it's the width this
      // component already collapses around — so a labelled copy that's still
      // wrapped just past it would keep the fully-rounded corners; narrow it
      // further here if that turns out to matter in practice.
      className={
        "flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-1.5 shadow-elev-2 min-[480px]:rounded-pill " +
        (readOnly || expanded ? "" : "max-[479px]:hidden")
      }
    >
      {TOOLS.map((tool, index) => {
        const Icon = ICONS[tool.id];
        const active = tool.id === value;
        // §8 — 20px in the live toolbar; the labelled marketing copy sits on a
        // text baseline, where 18px balances better against text-sm.
        const body = <Icon size={readOnly ? 18 : ICON_SIZE} strokeWidth={1.5} aria-hidden />;

        return (
          <div key={tool.id} className="flex items-center">
            {/* §10.5 — 1px --wg-200 divider between the groups. */}
            {DIVIDERS.has(index) ? (
              <span className="mx-1 h-6 w-px bg-wg-200" aria-hidden />
            ) : null}

            {readOnly ? (
              <span
                className={
                  "flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm " +
                  (active ? ACTIVE : "text-ink-secondary")
                }
              >
                {body}
                {tool.label}
                <kbd className="ml-0.5 font-sans text-2xs text-ink-muted tabular-nums">
                  {tool.key}
                </kbd>
              </span>
            ) : (
              <Tooltip
                label={
                  <>
                    {tool.label}{" "}
                    <kbd className="font-sans text-white/70 dark:text-ink-muted">{tool.key}</kbd>
                  </>
                }
              >
                <button
                  type="button"
                  // A toolbar is a radio group in spirit: exactly one is active.
                  aria-pressed={active}
                  aria-label={`${tool.label} (${tool.key})`}
                  className={`${BUTTON} ${active ? ACTIVE : IDLE}`}
                  onClick={() => onChange?.(tool.id)}
                >
                  {body}
                </button>
              </Tooltip>
            )}
          </div>
        );
      })}

      {/* §10.5 — [color swatch] is the fourth group. The landing page's copy
          shows only the tools, which is all it is illustrating. */}
      {!readOnly && style && onStyleChange ? (
        <>
          <span className="mx-1 h-6 w-px bg-wg-200" aria-hidden />
          <StylePicker style={style} onChange={onStyleChange} />
        </>
      ) : null}
    </div>
  );

  if (readOnly) return pill;

  return (
    // §10.5 — bottom-centre, 24px from the canvas edge. The canvas is full
    // bleed (§4.2), so the toolbar floats over it and takes no layout width.
    <div
      {...{ [CHROME_ATTR]: "" }}
      className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center"
    >
      {/* relative: the positioning anchor for StylePicker's panel (see that
          file). It has to be here rather than on StylePicker's own small
          wrapper — the pill can wrap to a second row on a narrow phone, which
          moves its last item (the swatch trigger) unpredictably, so anything
          anchored to the trigger itself can land anywhere. This wrapper's
          width tracks the whole assembly and it's already kept on-screen by
          the centering above, so anchoring here keeps the panel on-screen too,
          regardless of where the trigger ends up. */}
      <div className="relative flex flex-col items-center gap-2 pointer-events-auto">
        {pill}
        <button
          type="button"
          aria-expanded={expanded}
          aria-label="Tools"
          onClick={() => setExpanded((open) => !open)}
          className={
            "min-[480px]:hidden grid size-11 place-items-center rounded-pill border border-border " +
            "bg-surface text-ink-secondary shadow-elev-2 focus-visible:focus-ring"
          }
        >
          <Wrench size={ICON_SIZE} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}
