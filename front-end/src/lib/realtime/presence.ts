// What a peer publishes about itself over the Yjs awareness protocol.
//
// Ephemeral by design: awareness is never persisted (docs/ARCHITECTURE.md).

import { CURSOR_COLORS, type CursorColor } from "@/lib/presence-colors";

export type Cursor = { x: number; y: number; t: number };

export type PresenceState = {
  name: string;
  /**
   * Palette entry NAME, not a hex value. The palette is mirrored on both sides,
   * so a name survives a palette tweak and keeps the wire small.
   */
  color: string | null;
  signedIn: boolean;
  avatarUrl?: string | null;
  cursor: Cursor | null;
  /**
   * Element ids this peer has selected, so everyone else can see what they're
   * working on. Optional: a peer on an older build never sends it.
   */
  selection?: string[];
};

/**
 * How much of a selection goes out. Every awareness update carries the whole
 * state to every peer, and a marquee over a busy board can select hundreds —
 * fifty outlines already say "they've selected a lot".
 */
export const MAX_SHARED_SELECTION = 50;

export type PresencePeer = {
  /** Yjs awareness client id — the only stable per-connection key. Not the
   *  user id, which is null for guests and shared across a user's tabs. */
  clientId: number;
  name: string;
  color: CursorColor;
  signedIn: boolean;
  avatarUrl: string | null;
  cursor: Cursor | null;
  /** Never missing: a peer that sent nothing, or something malformed, has none. */
  selection: string[];
};

/** A peer's selection as sent, trusted only as far as its shape can be checked. */
function selectionFrom(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((id): id is string => typeof id === "string")
    .slice(0, MAX_SHARED_SELECTION);
}

/**
 * Resolves a published colour name to a palette entry. Falls back by client id
 * so an unknown name (an older client, a palette that has since changed) still
 * gets a stable, distinct colour rather than none.
 */
export function colorByName(name: string | null, clientId: number): CursorColor {
  const found = name
    ? CURSOR_COLORS.find((color) => color.name === name)
    : undefined;
  return found ?? CURSOR_COLORS[clientId % CURSOR_COLORS.length];
}

/**
 * Turns raw awareness states into peers, dropping your own entry and anyone
 * who hasn't published a usable state yet.
 *
 * Sorted by client id so the DOM order is stable — otherwise cursors and
 * avatars reshuffle whenever a Map iteration order changes.
 */
export function peersFrom(
  states: Map<number, unknown>,
  selfClientId: number,
): PresencePeer[] {
  const peers: PresencePeer[] = [];

  for (const [clientId, raw] of states) {
    if (clientId === selfClientId) continue;
    const state = raw as Partial<PresenceState> | null;
    if (!state || typeof state.name !== "string") continue;

    peers.push({
      clientId,
      name: state.name,
      color: colorByName(state.color ?? null, clientId),
      signedIn: state.signedIn === true,
      avatarUrl: state.avatarUrl ?? null,
      cursor: state.cursor ?? null,
      selection: selectionFrom(state.selection),
    });
  }

  return peers.sort((a, b) => a.clientId - b.clientId);
}
