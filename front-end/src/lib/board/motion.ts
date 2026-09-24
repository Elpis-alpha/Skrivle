// The one rule for smoothing things that arrive over the network (§7).
//
// Peers publish every PUBLISH_MS, so anything drawn straight from what they
// sent — a cursor, an element they are dragging — moves in steps. Both close
// the gap to the latest position by the same fraction per frame, sized to take
// about INTERPOLATE_MS, with no easing curve: curves make a cursor look like it
// is stuttering. Cursors and the elements they drag share this so the two
// travel together rather than one visibly leading the other.

/** §7 — "interpolate position over ~70ms linear". */
export const INTERPOLATE_MS = 70;

/** Within this many board units, a value has arrived. */
const ARRIVED = 0.5;

/** One frame's step from `current` toward `target`. */
export function approach(current: number, target: number, dt: number): number {
  const t = Math.min(1, dt / INTERPOLATE_MS);
  return current + (target - current) * t;
}

/**
 * One frame's step for several named values at once.
 *
 * Returns `target` itself — the same object — once every key has arrived, which
 * is how a caller knows to stop asking.
 */
export function approachAll<T extends Record<K, number>, K extends keyof T>(
  current: T,
  target: T,
  keys: readonly K[],
  dt: number,
): T {
  let arrived = true;
  const next = { ...target };
  for (const key of keys) {
    const value = approach(current[key], target[key], dt);
    if (Math.abs(target[key] - value) > ARRIVED) {
      arrived = false;
      next[key] = value as T[K];
    }
  }
  return arrived ? target : next;
}
