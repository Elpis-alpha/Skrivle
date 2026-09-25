// Arrow keys move the selection.
//
// A held arrow key repeats at the OS's rate, 10–30 presses a second, which is
// already about the cadence a drag publishes at (PUBLISH_MS), so each press
// writes the document straight away rather than going through a second clock.

import type { Point } from "./geometry";

/** How far one press moves, in board units. Shift moves further. */
export const NUDGE = 1;
export const NUDGE_FAR = 10;

/**
 * Presses closer together than this, on the same selection, are one burst —
 * and one undo step. Longer than a key's delay before it starts repeating, so
 * holding a key down never splits.
 */
export const NUDGE_BURST_MS = 1000;

const DIRECTIONS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** How far a key moves the selection, or null if it isn't an arrow. */
export function nudgeFor(key: string, far: boolean): Point | null {
  const direction = DIRECTIONS[key];
  if (!direction) return null;
  const step = far ? NUDGE_FAR : NUDGE;
  // `+ 0` so a zero axis is 0 rather than -0.
  return { x: direction.x * step + 0, y: direction.y * step + 0 };
}

/** One press: when, and on which selection. */
export type Nudge = { at: number; ids: readonly string[] };

/**
 * Whether a press carries on the burst the last one started.
 *
 * The selection is compared by identity: the tool reducer replaces it rather
 * than editing it, so a new array means something was selected in between,
 * even when it holds the same ids.
 */
export function continuesBurst(last: Nudge | null, next: Nudge): boolean {
  return last !== null && last.ids === next.ids && next.at - last.at <= NUDGE_BURST_MS;
}
