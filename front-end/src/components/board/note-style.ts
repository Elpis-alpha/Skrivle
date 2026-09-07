// STYLE_GUIDE.md §2.5 / §10.7 — how a sticky note is painted.
//
// Shared so the real note and the landing page's mock cannot drift apart, the
// same way CursorArrow already is.

import { NOTE_COLORS } from "@/lib/presence-colors";

/** Matches the 4px base unit and the mock's p-3. */
export const NOTE_PADDING = 12;

/** §10.7 — `--radius-note`, `--ink` text, and the fill from §2.5. */
export const NOTE_CLASS = "rounded-note border text-ink";

export function noteSurface(fill: string | null): {
  backgroundColor: string;
  borderColor: string;
} {
  // Gray is the default for a new note (§2.5), and the fallback for a colour
  // name this build doesn't know.
  const color = NOTE_COLORS.find((c) => c.name === fill) ?? NOTE_COLORS[0];
  const darker = (hex: string) => `color-mix(in srgb, ${hex} 92%, #000)`;
  return {
    // light-dark() rather than a CSS var, because the palette is data (§11.2)
    // and both halves have to travel together.
    backgroundColor: `light-dark(${color.light}, ${color.dark})`,
    // §2.5 — "1px of the fill hue at ~8% darker".
    borderColor: `light-dark(${darker(color.light)}, ${darker(color.dark)})`,
  };
}
