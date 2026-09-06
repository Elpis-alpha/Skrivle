# Skrivle — Style Guide

Status: design system spec. No UI is built yet. This document is the source of
truth for anything visual in `front-end/` and `coming-soon/`.

Brand constraints (fixed): **Poppins** for all type · **minimal** · canvas is
**white / off-white / warm gray** · accent is **`#32174D`, "Dark Amethyst"**.

---

## 1. Principles

**The canvas is paper. The chrome is one piece of hardware.** The board surface
stays quiet and neutral so the work is the only thing with color. All interface
— toolbar, panels, dialogs — is treated as a single consistent instrument laid
over the paper, not a set of unrelated widgets.

**Skrivle writes in ink, not black.** Every text color and the default pen/shape
stroke derive from the amethyst (`--ink` is a very dark desaturated amethyst, not
`#000`). A board drawn entirely in the default color still looks like Skrivle.

**Spend the amethyst in two places only.** The primary action on any screen fills
with full-strength `--accent` (`#32174D`), and *your own* presence — cursor,
avatar ring, selection box — is drawn in the amethyst family (`--accent-500`
`#5C2E86` for the cursor/ring so it reads at small sizes; `--accent` for the
selection outline). Every other collaborator's presence uses a borrowed hue from
the cursor palette (§2.6). Nothing else is amethyst. This keeps "the Skrivle
color" meaningful.

**One motion moment.** The board "settle" on hydrate (§7) is the only
non-user-triggered animation. Everything else moves only in direct response to an
action, and briefly.

**Quality floor** (non-negotiable, never announced):

- Responsive to 360px width; touch targets ≥ 44px on coarse pointers.
- Focus is always visible (§9). Never remove an outline without replacing it.
- `prefers-reduced-motion` and `prefers-contrast` are respected.
- Body text ≥ 7:1 contrast where feasible, 4.5:1 minimum; UI text/icons ≥ 3:1.
- Meaning is never carried by color alone (presence = color **+** name; selection
  = outline **+** handles).

---

## 2. Color

### 2.1 Warm gray / paper

Warm = nudged toward yellow, never blue. This is the canvas, surfaces, borders,
and muted text.

| Token | Light | Role |
| --- | --- | --- |
| `--canvas-bg` | `#FAF9F7` | infinite board surface, app background |
| `--surface` | `#FFFFFF` | panels, cards, inputs, menus |
| `--surface-raised` | `#FFFFFF` | (light: same as surface; differs in dark) |
| `--wg-50` | `#F5F3F0` | hover fills, skeleton base |
| `--wg-100` | `#EDEAE4` | pressed fills, dot grid, dividers on white |
| `--wg-200` | `#DEDAD2` | `--border` — default hairline |
| `--wg-300` | `#C6C0B4` | `--border-strong`, dashed "new" tiles, scrollbar thumb |
| `--wg-400` | `#A8A093` | disabled text, icon on disabled control |
| `--wg-500` | `#857D6E` | large muted labels only (3.9:1 — not for body) |
| `--wg-600` | `#5F584C` | — |

### 2.2 Ink (purple-tinted, from the accent)

| Token | Light | Contrast on `--canvas-bg` | Role |
| --- | --- | --- | --- |
| `--ink` | `#241631` | 16.2:1 | body text, headings, default stroke |
| `--ink-secondary` | `#4A3D57` | 9.5:1 | secondary text, inactive tool icons |
| `--ink-muted` | `#6F6579` | 5.2:1 | timestamps, helper text, placeholders |

### 2.3 Amethyst accent

Base is `--accent-700` = `#32174D`.

| Step | Hex | Typical use |
| --- | --- | --- |
| `--accent-50` | `#F4EEF9` | selected-row bg, active-tool bg, accent-subtle |
| `--accent-100` | `#E7DBF1` | accent hairline, chip bg |
| `--accent-200` | `#CBB3E0` | disabled primary button, dark-theme hover |
| `--accent-300` | `#A57FC7` | **dark-theme** interactive fill, dark focus ring |
| `--accent-400` | `#7A4DA6` | accent icon on tint, secondary accent text |
| `--accent-500` | `#5C2E86` | **your** presence (cursor arrow, avatar ring) |
| `--accent-600` | `#432066` | light primary-button hover |
| `--accent-700` | `#32174D` | **light primary-button fill, links, focus ring** |
| `--accent-800` | `#25113A` | light primary-button active/pressed |

Semantic aliases (theme-swapped in §11):

- `--accent` → 700 (light) / 300 (dark)
- `--accent-hover` → 600 (light) / 200 (dark)
- `--accent-active` → 800 (light) / 100 (dark)
- `--accent-subtle` → 50 (light) / `rgba(165,127,199,.16)` (dark)
- `--accent-on` (text/icon over `--accent`) → `#FFFFFF` (light) / `#1A1620` (dark)

White on `#32174D` = 15.4:1. `#1A1620` on `#A57FC7` = 5.5:1.

### 2.4 Semantic

| Token | Hex | Notes |
| --- | --- | --- |
| `--success` | `#2E7D5B` | white text 5.0:1 |
| `--warning` | `#B26B00` | the guest-board expiry chip |
| `--warning-strong` | `#806200` | warning used *as text* (small) |
| `--danger` | `#B23A3A` | destructive actions, form errors; white text 5.9:1 |

Each has a `-subtle` background tint: `--success-subtle` `#E4F1EA`,
`--warning-subtle` `#F6E8D4`, `--danger-subtle` `#F5E1E1` (dark values in §11).
Status text on a `-subtle` tint uses `--ink` or the `-strong` variant, never the
mid-tone on the tint.

### 2.5 Sticky-note palette

Seven warm, low-chroma fills. `--ink` on every one clears 12:1. Gray is the
default for a new note.

| Name | Light fill | Dark fill |
| --- | --- | --- |
| butter | `#FDF3C7` | `#5A4E28` |
| peach | `#FCE0C4` | `#5B4530` |
| rose | `#F8D3D6` | `#5A3A3E` |
| sky | `#D3E4F3` | `#33465A` |
| mint | `#D2EAD9` | `#33513E` |
| lilac | `#E4DAF2` | `#453A5C` |
| gray *(default)* | `#EAE7E1` | `#3B3843` |

Note border: 1px of the fill hue at ~8% darker, plus `--elev-1` while dragging.
In dark mode, note text switches to `--ink` on dark (`#F2EEF6`) — confirm ≥ 4.5:1
against each dark fill when implementing.

### 2.6 Multiplayer cursor palette

Assigned round-robin as people join. `--accent-500` is **reserved for you** and
never handed out. Each entry has a `base` (cursor arrow fill) and a darker `label`
(name-tag background, white text). All `label` values clear 4.5:1 with white.

| Hue | base | label | white-on-label |
| --- | --- | --- | --- |
| coral | `#E5613C` | `#C0431F` | 5.2:1 |
| ochre | `#D9A400` | `#806200` | 5.7:1 |
| teal | `#1F9E8F` | `#16736A` | 5.7:1 |
| cobalt | `#3E6FD9` | `#2F55B0` | 6.9:1 |
| magenta | `#C64B9E` | `#9E3C7D` | 6.2:1 |
| forest | `#4C9A3F` | `#3A7530` | 5.6:1 |
| slate-blue | `#6663C4` | `#4E4BA0` | 7.4:1 |
| rust | `#B0552F` | `#8A4021` | 7.4:1 |

The cursor arrow always carries a 1.5px `--surface` outline (light) / `--ink`
outline (dark) so low-contrast hues (ochre) still read on any background. Names
always accompany the color — hue is never the only identifier.

Dark mode: raise each `base` ~8% lightness; `label` stays as above (white text
still contrasts).

---

## 3. Typography

**One family: Poppins.** Geometric, friendly, slightly wide — carries the minimal
brand without a second face. Load weights 400, 500, 600, and 700 (700 is loaded
only for the wordmark).

| Weight | Use |
| --- | --- |
| 400 Regular | body, input text, menu items, note/canvas text |
| 500 Medium | UI labels, buttons, active nav, table headers, "eyebrow" emphasis |
| 600 SemiBold | headings, dialog titles, board title |
| 700 Bold | the `skrivle` wordmark only |

Do **not** use 300 (too fragile on canvas UI) or 700 outside the wordmark.

### 3.1 Type scale

App UI base is **14px**, ratio ~1.200. Sizes are `px / line-height px`.

| Token | Size / LH | Use |
| --- | --- | --- |
| `text-2xs` | 11 / 16 | cursor name tags, micro-labels |
| `text-xs` | 12 / 16 | timestamps, helper text, tile metadata |
| `text-sm` | 13 / 20 | secondary UI, table cells |
| `text-base` | 14 / 22 | body, inputs, menu items, buttons |
| `text-md` | 16 / 24 | panel section titles |
| `text-lg` | 20 / 28 | dialog titles |
| `text-xl` | 25 / 32 | page headings ("My Boards") |
| `text-2xl` | 31 / 40 | landing subhead |
| `text-3xl` | 39 / 44 | landing hero line |
| `text-4xl` | 49 / 52 | `coming-soon` headline |
| `text-5xl` | 61 / 64 | marketing hero headline only (§13) — never in the product |

- Headings `lg`–`2xl`: letter-spacing `-0.015em`, weight 600.
- Display `3xl`–`5xl`: letter-spacing `-0.02em`, weight 600.
- Body: letter-spacing `0`, weight 400, measure capped at **68ch**.
- Numerals in countdowns, counts, and coordinates: `font-variant-numeric:
  tabular-nums`.
- Never set UI labels in all-caps. Emphasis is weight 500 + `--ink`, not caps and
  not letter-spacing.

### 3.2 Wordmark

`skrivle` — lowercase, Poppins 700, letter-spacing `-0.02em`, always `--ink`
(never accent — the name is not the accent). Minimum 16px. The dot of the "i"
is left as-is; no custom glyph work in v1. Clear space around it = the cap height
on all sides.

---

## 4. Space & layout

**4px base unit.** Scale (px): `2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 ·
64 · 80 · 96`. Tokens `--space-1` (4) … `--space-24` (96) — see §11.

- Component padding: controls 8–12px, panels/cards 16–24px, dialogs 24px.
- Default gap between sibling controls: 8px; between form fields: 16px; between
  page sections: 48–64px.

### 4.1 Landing (`/`) — hero

The landing page is a **marketing surface**; the rest of its anatomy, and the
rules it is allowed to bend, live in [§13](#13-marketing-surfaces). This section
covers only the hero, which stays governed by §1–§12.

Two columns at `lg`, stacked below. The hero **is the product**: a headline, a
large `New board` button, and a live board preview beside it — not a big-number
stat treatment. The left column is left-aligned and capped at 560px.

```
┌─────────────────────────────────────────────────────────┐
│  ◠ skrivle    Features  How it works  Open source  FAQ  │  ← 64px bar
│                              ☾   Sign in  [New board]   │
│                                                         │
│  A whiteboard you can        ┌───────────────────────┐  │  ← text-5xl, --ink
│  share in one link.          │ · · · · · · · · · · · │  │
│                              │ ·┌──────┐· · ·↖ Maya· │  │  ← live mock:
│  No account. No download.    │ · │ note │ · · · · · ·│  │    notes, a stroke
│  Open the link and draw.     │ ·└──────┘· ·╭─╮ · · · │  │    drawing itself,
│                              │ · · · ·↖ Ben ╰─╯· · · │  │    2 cursors
│  [ New board ]               │ · · · · · · · · · · · │  │
│                              └───────────────────────┘  │
│  ┌────────────────────────┐                             │
│  │ …/board/ │ id    │Join │                             │  ← §10.4 pattern
│  └────────────────────────┘                             │
│                                                         │
│  ✓ Free   ✓ No sign-up   ✓ Any browser                  │  ← three facts,
└─────────────────────────────────────────────────────────┘     not a · string
```

The dot grid sits behind the whole hero at `--grid-dot`, radially masked so it
fades out before the edges. The board preview is the page's one ambient loop
(§13.2) — it is a mock, never a real Yjs doc.

### 4.2 Board (`/board/:id`)

Full-bleed canvas. Chrome floats over it: top bar, bottom-center toolbar,
top-right presence. Nothing docks or takes layout width from the canvas.

```
┌───────────────────────────────────────────────┐
│ skrivle   Untitled board        (o)(o)(+2)  ⤴ │  ← top bar, --surface, --elev-2
│                                    Share  Sign in
│                                               │
│         · · · · · · · · · · · · · · ·         │  ← dot grid --wg-100 / 24px
│         · · · ┌───────┐ · · · · · · ·         │
│         · · · │ note  │ · · ↖ Maya  · ·        │  ← remote cursor + tag
│         · · · └───────┘ · · · · · · ·         │
│                                               │
│              ┌───────────────────┐            │
│              │ ▚  ▭  ○  ／  ✎  ●  ⋯ │           │  ← toolbar, pill, --elev-2
│              └───────────────────┘            │
└───────────────────────────────────────────────┘
```

Guest boards add an amber chip in the top bar: `Expires in 23h · Extend`
(`--warning-subtle` bg, `--warning-strong` text, `--radius-pill`).

### 4.3 My Boards (signed-in home)

Left-aligned page, `text-xl` heading, responsive grid of tiles (min 240px,
16px gap). First tile is a dashed `--border-strong` "New board". Empty state:
_"No boards yet. Create one to get started."_ + primary button.

### 4.4 Canvas dot grid

Dots at `--wg-100` (light) / `#2A2434` (dark), 24px spacing, 1.5px diameter.
Opacity scales with zoom: full at 100%, fades to 0 below ~40% zoom.

---

## 5. Radius

Differentiated by *what the object is*, not one value everywhere.

| Token | Value | Applies to | Why |
| --- | --- | --- | --- |
| `--radius-none` | `0` | freehand strokes, straight lines/arrows | ink has no corners |
| `--radius-note` | `2px` | sticky notes | paper squares, barely eased |
| `--radius-sm` | `6px` | inputs, small/icon buttons, menu items, chips-square | software controls |
| `--radius-md` | `10px` | cards, board tiles, primary/secondary buttons, popovers | containers you act on |
| `--radius-lg` | `16px` | dialogs, side panels, toasts | large containers |
| `--radius-pill` | `999px` | the toolbar, avatar chips, presence tags, expiry chip | "hardware" |

---

## 6. Borders & elevation

Minimal means **hairline first**. Reach for `--border` (1px `--wg-200`) to
separate things; use shadow only for something genuinely floating above the
canvas.

| Token | Light value | Use |
| --- | --- | --- |
| `--elev-1` | `0 1px 2px rgba(36,22,49,.06), 0 1px 1px rgba(36,22,49,.04)` | resting board tiles, dragged note |
| `--elev-2` | `0 4px 12px rgba(36,22,49,.10)` | toolbar, top bar, dropdowns, popovers, toasts |
| `--elev-3` | `0 12px 32px rgba(36,22,49,.16)` | dialogs, element being dragged across the board |

Shadow color is always amethyst-tinted (`rgba(36,22,49,…)`), never neutral black.

Dark theme: shadows deepen (`rgba(0,0,0,.4/.5)`) **and** raised surfaces get a
`inset 0 1px 0 rgba(255,255,255,.04)` top highlight so they lift off the canvas.

---

## 7. Motion

| Token | Value | Use |
| --- | --- | --- |
| `--dur-fast` | `120ms` | hover, press, focus ring, tooltip in |
| `--dur-base` | `180ms` | menu/popover open, tool switch, toast in |
| `--dur-slow` | `280ms` | dialog + scrim, side panel |
| `--dur-settle` | `400ms` | board hydrate sequence (once per load) |
| `--ease-standard` | `cubic-bezier(.2,0,0,1)` | most transitions |
| `--ease-entrance` | `cubic-bezier(.3,0,0,1)` | things entering the screen |

**Remote cursors:** interpolate position over ~70ms linear — no easing curve
(curves make cursors look like they're stuttering). Name tag fades out after 3s
idle, fades back in on movement.

**The board settle (the one orchestrated moment):** on load the canvas is
`--wg-50` with the dot grid and all elements at 0 opacity. When the Yjs doc is
ready: background → `--canvas-bg` (200ms), dot grid fades in (200ms), then
elements fade in with an 8px rise, staggered ~20ms in document order. Total under
`--dur-settle`. That's the whole animation budget for the page.

**`prefers-reduced-motion: reduce`:** skip the settle (elements just appear),
skip the element stagger and rise, keep opacity/color transitions but drop
transforms. Cursor interpolation still runs (it's a readability aid, not decor).

---

## 8. Iconography

- Line icons, **1.5px** stroke, 24px grid, round caps and joins — matches
  Poppins' geometric-but-soft character. [Lucide](https://lucide.dev) is the
  compatible set; use it rather than mixing sources.
- In-toolbar tool icons render at 20px and inherit `--ink-secondary`; the active
  tool gets `--accent-subtle` background (`--radius-sm`) and an `--accent-400`
  icon.
- Icon-only controls always carry an `aria-label` and a tooltip (§ components).

---

## 9. Focus & states

**Focus ring** — a double ring so it shows on the canvas, on white, and on an
accent fill alike:

```
box-shadow: 0 0 0 2px var(--canvas-bg), 0 0 0 4px var(--accent);
```

On `--surface` the inner ring reads as a gap; on the accent primary button swap
the inner ring to `rgba(255,255,255,.9)`. Dark theme uses `--accent-300` for the
outer ring. `:focus-visible` only — never on mouse click.

**`prefers-contrast: more`:** `--border` → `--wg-400`, focus outer ring → 3px,
disabled opacity floor raised to 0.55.

---

## 10. Components

Each spec lists anatomy, sizes, and the tokens in play. States are always:
default → hover → active/pressed → focus-visible → disabled (and loading where an
action is async).

### 10.1 Button

| Variant | Fill / border | Text | Hover | Active |
| --- | --- | --- | --- | --- |
| primary | `--accent` | `--accent-on` | `--accent-hover` | `--accent-active` |
| secondary | `--surface` + 1px `--border` | `--ink` | bg `--wg-50` | bg `--wg-100` |
| ghost | none | `--ink` | bg `--wg-50` | bg `--wg-100` |
| danger | `--danger` | `#FFFFFF` | darken 6% | darken 12% |

- Sizes: **sm** 32px h / 12px pad / `text-sm`; **md** 40px h / 16px pad /
  `text-base`. Radius `--radius-md`. Weight 500.
- Disabled: primary → `--accent-200` fill, no shadow; others → `--wg-400` text;
  `cursor: not-allowed`, no hover.
- Loading: label is replaced by a 16px spinner, button width is held, control
  stays focusable, `aria-busy="true"`.
- Label is the outcome, sentence case, no trailing icon-arrow: `New board`,
  `Save changes`, `Copy link` — not `Submit`, not `Copy link →`.

### 10.2 Icon button

Square, `--radius-sm`, sizes 32 / 36 / 40px. Icon 20px `--ink-secondary`, →
`--ink` on hover with `--wg-50` bg. Always `aria-label` + tooltip.

### 10.3 Text input / field

- 40px height, `--surface`, 1px `--border`, `--radius-sm`, `text-base`, 12px
  horizontal padding.
- Focus: border `--accent`, plus `0 0 0 3px var(--accent-subtle)`.
- Label above at `text-sm` / weight 500 / `--ink`. Helper text `text-xs`
  `--ink-muted`. Error: border `--danger`, helper text `--danger`, message names
  the fix ("Board name is taken — try another").
- Placeholder `--ink-muted`.

### 10.4 Board-id field (create dialog)

Single row: the static prefix `<origin>/board/` in `--ink-muted`, then the input.
Empty = "we'll generate one" hint. The id follows the board-id rules in
[ARCHITECTURE.md](ARCHITECTURE.md#board-identity); uniqueness is checked on blur
with an inline spinner → check or error. The id is immutable after creation — the
dialog says so once, quietly.

### 10.5 Floating toolbar

- Pill (`--radius-pill`), `--surface`, `--elev-2`, 6px padding, 4px gap, bottom-
  center, 24px from the canvas edge.
- Groups separated by a 1px `--wg-200` divider: [select, hand] · [note, text] ·
  [rectangle, circle, line/arrow, pen] · [color swatch] · [more ⋯].
- Active tool: `--accent-subtle` bg, `--accent-400` icon, `--radius-sm`.
- Hover shows the tool name + shortcut key in a tooltip (`V` select, `H` hand,
  `N` note, `T` text, `R` rectangle, `O` circle, `L` line/arrow, `P` pen).
- Collapses to an icon that opens the full pill below 480px width.

### 10.6 Color / stroke picker

Popover (`--radius-md`, `--elev-2`, 8px padding). Row of the 7 note-palette
swatches (§2.5) for fills, plus `--ink` and `--accent-500` for strokes. Selected
swatch has a 2px `--ink` ring. Stroke-width segmented control: 1 / 2 / 4 / 8px.

### 10.7 Sticky note

- `--radius-note`, fill from palette (default gray), `--ink` text `text-base`,
  min 160×160, auto-grows downward.
- Border: fill hue −8% lightness, 1px. `--elev-1` only while dragging.
- Selected: 1px `--accent` bounding box with 6px `--accent` square handles at
  corners/edges. Double-click enters text edit; caret is `--accent`.

### 10.8 Shapes (rectangle / circle / line / arrow)

- Default: no fill, 2px `--ink` stroke, `--radius-none`.
- Fill picker applies note-palette colors at full opacity.
- Selection: same `--accent` bounding box + handles as the note; line/arrow get
  endpoint handles only.

### 10.9 Text box

No border or background until hovered (1px dashed `--border`) or editing (1px
solid `--accent`). Placeholder `--ink-muted` "Type something". `text-base` to
`text-2xl` via the size control; color from the stroke picker.

### 10.10 Remote cursor + name tag

SVG arrow filled with the user's `base` hue + 1.5px outline (§2.6). Name tag:
`--radius-pill`, `label`-hue background, `#FFFFFF` `text-2xs` weight 500, 2px 6px
padding, offset 4px right / 2px down from the arrow tip. Tag hides after 3s idle.

### 10.11 Avatar cluster

Top-right of the board bar. Overlapping 24px circles (−8px overlap), each a
`label`-hue disc with white initials or the OAuth avatar image. **Your** avatar
has a 2px `--accent-500` ring. Beyond 4, collapse to `+N` chip
(`--wg-100` bg, `--ink-secondary`). Hover → name tooltip. Click the cluster →
a list popover ("Maya · editor", "You · owner").

### 10.12 Board top bar

`--surface`, `--elev-2`, 56px tall, full width, floating. Left: wordmark (→ `/`).
Center-left: board title — `text-base` weight 600, inline-editable for owners
(click → input, Enter/blur saves, toast `Title saved`). Right: expiry chip (guest
only), avatar cluster, `Share` (secondary), `Sign in` (primary ghost) or the user
menu.

### 10.13 Share dialog

`--radius-lg`, `--elev-3`, max-width 440px. A read-only URL field + `Copy link`
button (→ toast `Link copied`). One line: _"Anyone with this link can edit."_ For
guests, a divider then: _"Sign in to keep this board after it expires."_ + an
email field (`Continue with email`) and, below an `or` divider,
`Continue with GitHub` / `Continue with Google`.

### 10.14 Auth dialog / page

Email first: an email field (§10.3) with a primary `Continue with email`, then a
one-time-code step — a 6-digit input, label _"Enter the code we emailed to that
address"_, primary `Verify and sign in`, and a quiet `Use a different email` link
back. Below an `or` divider, two stacked secondary buttons, each with the
provider glyph: `Continue with GitHub`, `Continue with Google`. One supporting
line: _"Your boards will be saved to your account."_ No passwords.

### 10.15 My Boards grid + tile

Tile: `--radius-md`, 1px `--border`, `--elev-1`, a 16:10 canvas thumbnail on
`--canvas-bg`, then title (`text-sm` weight 500, truncate), `edited 2h ago`
(`text-xs` `--ink-muted`), and a role badge (`owner` / `editor` — `--wg-100` bg,
`text-2xs`). Hover: `--elev-2`. Overflow menu (⋯): Rename, Duplicate, Delete
(`--danger` text) → Delete opens a confirm dialog.

### 10.16 Dialog / modal base

Centered, `--surface-raised`, `--radius-lg`, `--elev-3`, 24px padding, max-width
440 (sm) / 560 (md). Scrim `rgba(26,22,32,.4)` + 2px backdrop blur. Title
`text-lg` weight 600. Closes on Esc and scrim click; focus is trapped and
returns to the trigger on close. Enter/`--dur-slow` `--ease-entrance` (scrim
fade + 8px rise); reduced-motion → fade only.

### 10.17 Toast

Bottom-center, above the toolbar (or top-center on the landing page). `--surface`,
`--elev-2`, `--radius-lg`, `--ink` `text-sm`, one line, 4s auto-dismiss, max 1
visible (queue the rest). Success gets a 6px `--success` dot before the text — not
a full green fill. Errors persist until dismissed and use `--danger` text.

### 10.18 Dropdown menu

`--surface`, `--elev-2`, `--radius-md`, 4px padding. Items: `text-base`, 8px 10px
padding, `--radius-sm`, hover `--wg-50`. Section divider 1px `--wg-100`.
Destructive items `--danger` text (hover `--danger-subtle` bg). Full keyboard
nav; opens with `--dur-base`.

### 10.19 Tooltip

`--ink` background (a dark chip, even in light mode), `#FFFFFF` `text-xs`,
`--radius-sm`, 6px 8px padding, 120ms open delay, no delay between adjacent
targets. Never contains interactive content. Dark theme: `--surface-raised` bg,
`--ink` text.

### 10.20 Skeleton / loading

Animated shimmer between `--wg-50` and `--wg-100` (1.4s), radius matching the
target element. Board tiles, My Boards grid, and the board thumbnail use it.
Reduced-motion → static `--wg-50` block.

### 10.21 System states

| State | Treatment |
| --- | --- |
| Board not found | Centered card: _"That board doesn't exist yet."_ + `Create board "abc12"` (id prefilled). |
| Connection lost | Slim `--warning-subtle` bar under the top bar: _"Reconnecting…"_. On recovery: toast _"Back online"_, bar clears. Never blocks the canvas. |
| Board expired | Centered card: _"This board has expired."_ + `Start a new board`. |
| Empty My Boards | _"No boards yet. Create one to get started."_ + primary `New board`. |
| Save/permission error | Toast, `--danger` text, names the cause and the retry. |

Errors are in the interface's voice, state what happened and the next step, and
never apologize.

### 10.22 Panel scrollbars

Thin (8px), transparent track, `--wg-300` thumb at `--radius-pill`, thumb →
`--wg-400` on hover. Canvas itself has no visible scrollbar (it pans).

---

## 11. Tokens — implementation

### 11.1 CSS custom properties

```css
:root {
  color-scheme: light;

  /* paper */
  --canvas-bg: #FAF9F7;
  --surface: #FFFFFF;
  --surface-raised: #FFFFFF;
  --wg-50: #F5F3F0;
  --wg-100: #EDEAE4;
  --wg-200: #DEDAD2;
  --wg-300: #C6C0B4;
  --wg-400: #A8A093;
  --wg-500: #857D6E;
  --wg-600: #5F584C;
  --border: var(--wg-200);
  --border-strong: var(--wg-300);

  /* ink */
  --ink: #241631;
  --ink-secondary: #4A3D57;
  --ink-muted: #6F6579;

  /* amethyst scale */
  --accent-50: #F4EEF9;
  --accent-100: #E7DBF1;
  --accent-200: #CBB3E0;
  --accent-300: #A57FC7;
  --accent-400: #7A4DA6;
  --accent-500: #5C2E86;
  --accent-600: #432066;
  --accent-700: #32174D;
  --accent-800: #25113A;

  /* accent semantic */
  --accent: var(--accent-700);
  --accent-hover: var(--accent-600);
  --accent-active: var(--accent-800);
  --accent-subtle: var(--accent-50);
  --accent-on: #FFFFFF;

  /* presence (your own) */
  --you: var(--accent-500);

  /* semantic */
  --success: #2E7D5B;
  --success-subtle: #E4F1EA;
  --warning: #B26B00;
  --warning-strong: #806200;
  --warning-subtle: #F6E8D4;
  --danger: #B23A3A;
  --danger-subtle: #F5E1E1;

  /* canvas grid */
  --grid-dot: var(--wg-100);

  /* elevation */
  --elev-1: 0 1px 2px rgba(36,22,49,.06), 0 1px 1px rgba(36,22,49,.04);
  --elev-2: 0 4px 12px rgba(36,22,49,.10);
  --elev-3: 0 12px 32px rgba(36,22,49,.16);
  --raised-inset: none;

  /* radius */
  --radius-none: 0;
  --radius-note: 2px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-pill: 999px;

  /* space */
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
  --space-5: 20px;  --space-6: 24px;  --space-8: 32px;  --space-10: 40px;
  --space-12: 48px; --space-16: 64px; --space-20: 80px; --space-24: 96px;
  --space-32: 128px; /* marketing section rhythm at lg (§13.1) */
  --space-0-5: 2px;

  /* motion */
  --dur-fast: 120ms;
  --dur-base: 180ms;
  --dur-slow: 280ms;
  --dur-reveal: 320ms; /* marketing scroll reveal (§13.2) */
  --dur-settle: 400ms;
  --ease-standard: cubic-bezier(.2, 0, 0, 1);
  --ease-entrance: cubic-bezier(.3, 0, 0, 1);

  /* focus */
  --focus-ring: 0 0 0 2px var(--canvas-bg), 0 0 0 4px var(--accent);

  /* type */
  --font-sans: "Poppins", ui-sans-serif, system-ui, -apple-system, "Segoe UI",
    Roboto, "Helvetica Neue", Arial, sans-serif;
}

:root[data-theme="dark"] {
  color-scheme: dark;

  --canvas-bg: #1A1620;
  --surface: #241F2C;
  --surface-raised: #2E2838;
  --wg-50: #262130;      /* hover fills on dark */
  --wg-100: #302A3A;     /* pressed fills */
  --wg-200: #3A3343;     /* border */
  --wg-300: #48404F;     /* border-strong */
  --wg-400: #6B6276;     /* disabled text */
  --wg-500: #8E8399;
  --wg-600: #A99FB4;
  --border: var(--wg-200);
  --border-strong: var(--wg-300);

  --ink: #F2EEF6;
  --ink-secondary: #C4BBD0;
  --ink-muted: #968BA3;

  --accent: var(--accent-300);
  --accent-hover: var(--accent-200);
  --accent-active: var(--accent-100);
  --accent-subtle: rgba(165, 127, 199, .16);
  --accent-on: #1A1620;
  --you: var(--accent-300);

  --success: #4FB086;
  --success-subtle: #1E3A30;
  --warning: #D99A3C;
  --warning-strong: #E7B36A;
  --warning-subtle: #3A2E1C;
  --danger: #D96B6B;
  --danger-subtle: #3A2323;

  --grid-dot: #2A2434;

  --elev-1: 0 1px 2px rgba(0,0,0,.4);
  --elev-2: 0 4px 14px rgba(0,0,0,.45);
  --elev-3: 0 14px 36px rgba(0,0,0,.5);
  --raised-inset: inset 0 1px 0 rgba(255,255,255,.04);

  --focus-ring: 0 0 0 2px var(--canvas-bg), 0 0 0 4px var(--accent-300);
}
```

**Theme is always explicit.** A blocking inline script in `<head>` sets
`document.documentElement.dataset.theme` to `"light"` or `"dark"` before first
paint — from `localStorage` if the user has chosen, else from
`matchMedia("(prefers-color-scheme: dark)")`. A `matchMedia` listener updates it
live while the user is on "system". This keeps the CSS to the two blocks above
(no `@media` duplication, no flash-of-wrong-theme). For a no-JS fallback, add
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`
with the same body — optional, since the app requires JS anyway.

### 11.2 Palettes as data (iterated, not themed)

```js
// cursor colors — assigned round-robin; index by (joinOrder % CURSOR_COLORS.length)
// your own presence always uses the --you CSS var, never an entry here.
export const CURSOR_COLORS = [
  { name: "coral",      base: "#E5613C", label: "#C0431F" },
  { name: "ochre",      base: "#D9A400", label: "#806200" },
  { name: "teal",       base: "#1F9E8F", label: "#16736A" },
  { name: "cobalt",     base: "#3E6FD9", label: "#2F55B0" },
  { name: "magenta",    base: "#C64B9E", label: "#9E3C7D" },
  { name: "forest",     base: "#4C9A3F", label: "#3A7530" },
  { name: "slate-blue", base: "#6663C4", label: "#4E4BA0" },
  { name: "rust",       base: "#B0552F", label: "#8A4021" },
];

export const NOTE_COLORS = [
  { name: "gray",   light: "#EAE7E1", dark: "#3B3843" }, // default
  { name: "butter", light: "#FDF3C7", dark: "#5A4E28" },
  { name: "peach",  light: "#FCE0C4", dark: "#5B4530" },
  { name: "rose",   light: "#F8D3D6", dark: "#5A3A3E" },
  { name: "sky",    light: "#D3E4F3", dark: "#33465A" },
  { name: "mint",   light: "#D2EAD9", dark: "#33513E" },
  { name: "lilac",  light: "#E4DAF2", dark: "#453A5C" },
];
```

### 11.3 Tailwind config

> **This block is the Tailwind v3 reference.** `front-end/` runs Tailwind v4,
> which has no `tailwind.config.js` — the same mapping lives in `@theme` blocks
> in [`front-end/src/app/globals.css`](../front-end/src/app/globals.css), and
> that file is authoritative for the front-end. Keep the two in step; where they
> disagree, globals.css is right and this block needs updating.

```js
// tailwind.config.js — theme.extend. Values point at the CSS vars above so a
// single source of truth stays in :root and dark mode is automatic (every var
// flips under [data-theme="dark"]).
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx,js,jsx}"],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas-bg)",
        surface: { DEFAULT: "var(--surface)", raised: "var(--surface-raised)" },
        border: { DEFAULT: "var(--border)", strong: "var(--border-strong)" },
        grid: "var(--grid-dot)",
        wg: {
          50: "var(--wg-50)", 100: "var(--wg-100)", 200: "var(--wg-200)",
          300: "var(--wg-300)", 400: "var(--wg-400)", 500: "var(--wg-500)",
          600: "var(--wg-600)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          secondary: "var(--ink-secondary)",
          muted: "var(--ink-muted)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          active: "var(--accent-active)",
          subtle: "var(--accent-subtle)",
          on: "var(--accent-on)",
          50: "var(--accent-50)", 100: "var(--accent-100)", 200: "var(--accent-200)",
          300: "var(--accent-300)", 400: "var(--accent-400)", 500: "var(--accent-500)",
          600: "var(--accent-600)", 700: "var(--accent-700)", 800: "var(--accent-800)",
        },
        you: "var(--you)",
        success: { DEFAULT: "var(--success)", subtle: "var(--success-subtle)" },
        warning: {
          DEFAULT: "var(--warning)",
          strong: "var(--warning-strong)",
          subtle: "var(--warning-subtle)",
        },
        danger: { DEFAULT: "var(--danger)", subtle: "var(--danger-subtle)" },
      },
      fontFamily: { sans: "var(--font-sans)" },
      fontSize: {
        "2xs": ["11px", "16px"],
        xs: ["12px", "16px"],
        sm: ["13px", "20px"],
        base: ["14px", "22px"],
        md: ["16px", "24px"],
        lg: ["20px", { lineHeight: "28px", letterSpacing: "-0.015em", fontWeight: "600" }],
        xl: ["25px", { lineHeight: "32px", letterSpacing: "-0.015em", fontWeight: "600" }],
        "2xl": ["31px", { lineHeight: "40px", letterSpacing: "-0.015em", fontWeight: "600" }],
        "3xl": ["39px", { lineHeight: "44px", letterSpacing: "-0.02em", fontWeight: "600" }],
        "4xl": ["49px", { lineHeight: "52px", letterSpacing: "-0.02em", fontWeight: "600" }],
      },
      spacing: {
        0.5: "2px", 1: "4px", 2: "8px", 3: "12px", 4: "16px", 5: "20px",
        6: "24px", 8: "32px", 10: "40px", 12: "48px", 16: "64px", 20: "80px", 24: "96px",
      },
      borderRadius: {
        none: "0",
        note: "2px",
        sm: "6px",
        md: "10px",
        lg: "16px",
        pill: "999px",
      },
      boxShadow: {
        "elev-1": "var(--elev-1)",
        "elev-2": "var(--elev-2)",
        "elev-3": "var(--elev-3)",
      },
      transitionDuration: {
        fast: "120ms", base: "180ms", slow: "280ms", settle: "400ms",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(.2,0,0,1)",
        entrance: "cubic-bezier(.3,0,0,1)",
      },
      maxWidth: { measure: "68ch" },
    },
  },
};
```

### 11.4 Consuming this

- **`front-end/`**: put §11.1 in the global stylesheet, §11.3 in
  `tailwind.config.js`, §11.2 in `src/lib/presence-colors.ts`. Load Poppins
  (400/500/600/700) via `next/font/google` and feed it to `--font-sans`; the 700
  weight is used only by the `.wordmark` class. Set `data-theme` on `<html>` from
  the inline script described in §11.1 (`localStorage` choice, else system), and
  persist any explicit choice back to `localStorage`.
- **`coming-soon/`**: inline §11.1 and the Poppins `@font-face` (or a
  `<link>` to Google Fonts) in a single `<style>` block — no build step. Use
  `--accent`, `--ink`, `--canvas-bg`, `--font-sans` only; the headline is
  `text-4xl`, one primary-styled link, nothing else.

---

## 12. Checklist before shipping a screen

- [ ] Text on its background clears 4.5:1 (7:1 for long-form).
- [ ] Amethyst appears only as the primary action and your own presence.
- [ ] Radius matches the object type (§5), not one value everywhere.
- [ ] Shadows only on things that float; hairlines everywhere else.
- [ ] Keyboard: every control reachable, focus ring visible on each.
- [ ] `prefers-reduced-motion` and dark theme both checked.
- [ ] Copy is sentence case, active voice, names the outcome; no `→` on buttons,
      no all-caps labels, no decorative eyebrows.

---

## 13. Marketing surfaces

Everything above describes the **product**: the board, My Boards, the dialogs
laid over them. The pages that sell the product have a different job, and a few
of the product rules would make them worse. This section names those exceptions
and nothing more — anything §13 does not explicitly relax still applies.

**Scope.** `/`, `/about`, `/contact`, `/privacy`, `/terms`, `/faq`, and the
`coming-soon` page. **Not** `/board/*`, `/boards`, or `/signin` — those are
product surfaces and answer to §1–§12 alone.

### 13.1 What marketing may do that the product may not

| | Product (§1–§12) | Marketing (§13) |
| --- | --- | --- |
| Content width | panel/dialog widths | 1120px centred; prose still ≤ 68ch |
| Section rhythm | 48–64px | 96px, 128px at `lg` (`--space-24` / `--space-32`) |
| Display type | `text-4xl` ceiling | `text-5xl` for one headline per page |
| Motion | one moment, per §7 | §13.2 |
| Illustration | none | §13.3 |
| Amethyst | primary action + your presence | §13.4 |

### 13.2 Motion budget

§1's "one motion moment" is a product rule. A marketing page gets two things:

1. **Scroll reveal** — opacity 0→1 with an 16px rise, `--dur-reveal` (320ms)
   `--ease-entrance`, fired **once**, 60ms stagger between siblings. Reserve it
   for whole bands arriving, not for every card, chip, and list item; a page
   where everything fades up reads as a template.
2. **One ambient loop per page.** On `/` that budget is the hero board preview.
   Having spent it there, nothing else on `/` may animate on its own.

Both are gated on `prefers-reduced-motion: reduce`: reveals become instant, the
loop holds its finished frame. Hover, press, and focus transitions follow §7
unchanged.

### 13.3 Illustration

Permitted on marketing surfaces only. Any illustration is **token-mapped before
it ships** — inlined as SVG so `--ink`, `--surface`, and the warm grays reach it
and it re-inks itself in dark mode. Stock palettes never ship as drawn.

The map used for the [unDraw](https://undraw.co) set:

| Source | → |
| --- | --- |
| `#6c63ff` (unDraw indigo) | `var(--accent-400)` |
| `#fd6584` / `#ff6584` | `var(--accent-300)` |
| `#090814`, `#2f2e41`, `#010102` | `var(--ink)` |
| `#3f3d56` | `var(--ink-secondary)` |
| `#fff`, `#ffffff`, `#f2f2f2` | `var(--surface)` |
| `#e6e6e6`, `#e4e4e4`, `#d6d6e3` | `var(--wg-100)` |
| `#ccc`, `#cacaca` | `var(--wg-300)` |
| skin tones (`#a0616a`, `#ffb6b6`, `#ed9da0`, `#ffb8b8`, `#ffb9b9`) | **kept literal** — people are not tokens |

Illustrations are decorative: `aria-hidden="true"`, `focusable="false"`, and the
adjacent copy carries the meaning.

### 13.4 Amethyst on marketing

§1's rule holds for **solid** amethyst: a filled `--accent` block is still the
primary action and nothing else. Marketing may additionally use `--accent-subtle`
as a section or chip tint, `--accent-400` inside illustration line art, and
`--accent-100` as a hairline. Never a full-bleed amethyst band — the moment the
accent becomes a background, the primary button stops meaning anything.

### 13.5 Honesty

The product has no users yet, and the page says so by omission: no invented
metrics, no testimonials, no customer logo wall, no "trusted by" anything. Where
a feature is unbuilt, the page states its status plainly (see the roadmap band
on `/`) rather than implying it ships today. This is a portfolio piece; a
fabricated number costs more than it buys.

### 13.6 Copy

§12's voice rules apply in full, plus two marketing-specific ones:

- No eyebrow labels above headings. If a section needs naming, the heading names
  it.
- No meta strings joined with middle dots (`Free · No sign-up · Fast`). Give the
  items real structure — a list, a row of checks, separate lines.
