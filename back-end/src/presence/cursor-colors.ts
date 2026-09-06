// STYLE_GUIDE.md §11.2 — cursor palette, mirrored from
// front-end/src/lib/presence-colors.ts. Keep the order identical: the server
// assigns a colour by join order and the client renders it.

export type CursorColor = {
  name: string;
  /** cursor arrow fill */
  base: string;
  /** name-tag background, always paired with white text */
  label: string;
};

// Assigned round-robin as people join: index by (joinOrder % CURSOR_COLORS.length).
// A person's own presence uses the --you CSS var on the client, never an entry here.
export const CURSOR_COLORS: readonly CursorColor[] = [
  { name: "coral", base: "#E5613C", label: "#C0431F" },
  { name: "ochre", base: "#D9A400", label: "#806200" },
  { name: "teal", base: "#1F9E8F", label: "#16736A" },
  { name: "cobalt", base: "#3E6FD9", label: "#2F55B0" },
  { name: "magenta", base: "#C64B9E", label: "#9E3C7D" },
  { name: "forest", base: "#4C9A3F", label: "#3A7530" },
  { name: "slate-blue", base: "#6663C4", label: "#4E4BA0" },
  { name: "rust", base: "#B0552F", label: "#8A4021" },
] as const;

/** The colour for the Nth person to join a board (round-robin). */
export function colorForJoinOrder(joinOrder: number): CursorColor {
  return CURSOR_COLORS[joinOrder % CURSOR_COLORS.length]!;
}
