// STYLE_GUIDE.md §11.2 — palettes as data (iterated, not themed).

export type CursorColor = {
  name: string;
  /** cursor arrow fill */
  base: string;
  /** name-tag background, always paired with white text */
  label: string;
};

// Assigned round-robin as people join: index by (joinOrder % CURSOR_COLORS.length).
// Your own presence always uses the --you CSS var, never an entry here.
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

export type NoteColor = {
  name: string;
  light: string;
  dark: string;
};

// Gray is the default fill for a new sticky note.
export const NOTE_COLORS: readonly NoteColor[] = [
  { name: "gray", light: "#EAE7E1", dark: "#3B3843" },
  { name: "butter", light: "#FDF3C7", dark: "#5A4E28" },
  { name: "peach", light: "#FCE0C4", dark: "#5B4530" },
  { name: "rose", light: "#F8D3D6", dark: "#5A3A3E" },
  { name: "sky", light: "#D3E4F3", dark: "#33465A" },
  { name: "mint", light: "#D2EAD9", dark: "#33513E" },
  { name: "lilac", light: "#E4DAF2", dark: "#453A5C" },
] as const;
