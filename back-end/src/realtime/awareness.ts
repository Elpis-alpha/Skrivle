// Live cursors, names, and colours — the Yjs awareness protocol.
//
// Awareness is ephemeral by design (docs/ARCHITECTURE.md): it is never
// persisted, and it dies with the connection. The scaffold relayed awareness
// bytes blindly between sockets, which works while everyone leaves politely but
// leaks a ghost cursor forever when a client crashes or a tab is killed — the
// peer never sends the "I'm gone" update, and no one else can send it for them.
//
// Holding a real Awareness instance server-side fixes that: the server knows
// which client ids arrived on which socket, so it can retract exactly those on
// disconnect.
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import type * as Y from "yjs";

/** Marks changes the server itself made, so they are not echoed back as remote. */
export const SERVER_ORIGIN = "server";

const registry = new Map<string, Awareness>();

export function awarenessFor(boardId: string, doc: Y.Doc): Awareness {
  let awareness = registry.get(boardId);
  if (!awareness) {
    awareness = new Awareness(doc);
    // The server is a relay, not a participant — it must not occupy a cursor.
    awareness.setLocalState(null);
    registry.set(boardId, awareness);
  }
  return awareness;
}

/**
 * Apply a client's awareness update.
 * Returns the client ids the update introduced, so the caller can attribute
 * them to the socket and retract them when it goes away.
 */
export function applyClientAwareness(
  awareness: Awareness,
  update: Uint8Array,
  origin: unknown,
): number[] {
  const before = new Set(awareness.getStates().keys());
  applyAwarenessUpdate(awareness, update, origin);

  const introduced: number[] = [];
  for (const clientId of awareness.getStates().keys()) {
    if (!before.has(clientId)) introduced.push(clientId);
  }
  return introduced;
}

/** Encode the current state of the given clients for the wire. */
export function encodeStates(awareness: Awareness, clientIds: number[]): Uint8Array {
  return encodeAwarenessUpdate(awareness, clientIds);
}

/** Everyone currently present — sent to a client the moment it joins. */
export function encodeAllStates(awareness: Awareness): Uint8Array | null {
  const clientIds = [...awareness.getStates().keys()];
  if (clientIds.length === 0) return null;
  return encodeAwarenessUpdate(awareness, clientIds);
}

/**
 * Retract a departed socket's cursors. This is the call the blind-relay version
 * had no way to make.
 */
export function retractClients(awareness: Awareness, clientIds: number[]): void {
  if (clientIds.length === 0) return;
  removeAwarenessStates(awareness, clientIds, SERVER_ORIGIN);
}

/** Drop a board's awareness once its room is empty. */
export function releaseAwareness(boardId: string): void {
  const awareness = registry.get(boardId);
  if (!awareness) return;
  awareness.destroy();
  registry.delete(boardId);
}

/** Test seam. */
export function resetAwarenessRegistry(): void {
  for (const awareness of registry.values()) awareness.destroy();
  registry.clear();
}
