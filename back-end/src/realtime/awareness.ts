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
//
// It also means the server can say whose each client id is. An awareness update
// is a list of (client id, clock, state) entries, and nothing in the protocol
// stops one client sending an entry for another: moving a peer's cursor,
// retracting it, or inventing a thousand people. So every entry is checked
// against who owns its client id, and the ones a socket has no claim to are
// cut out before the update is applied or relayed.
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import type * as Y from "yjs";
import { MAX_CLIENT_IDS_PER_SOCKET } from "./limits.js";

/** Marks changes the server itself made, so they are not echoed back as remote. */
export const SERVER_ORIGIN = "server";

/**
 * Who may speak for a client id.
 *
 * Held by a key rather than by a socket, because a reconnect is a new socket
 * for the same client id, and it routinely arrives before the server has
 * noticed the old one is dead (that takes a ping timeout). The key is a secret
 * the client sends in its handshake and never anywhere else, so its next
 * socket can carry on moving its cursor while nobody else's can.
 */
type Owner = { key: string; sockets: Set<string> };

type Room = { awareness: Awareness; owners: Map<number, Owner> };

const registry = new Map<string, Room>();

/** The part of a socket that awareness needs to know about. */
export type AwarenessSocket = {
  id: string;
  /** See Owner. A client that sends none gets its socket id, which nothing else shares. */
  presenceKey: string;
  /** Client ids this socket has spoken for, released on disconnect. */
  awarenessClients: Set<number>;
};

export function awarenessFor(boardId: string, doc: Y.Doc): Awareness {
  let room = registry.get(boardId);
  if (!room) {
    const awareness = new Awareness(doc);
    // The server is a relay, not a participant — it must not occupy a cursor.
    awareness.setLocalState(null);
    room = { awareness, owners: new Map() };
    registry.set(boardId, room);
  }
  return room.awareness;
}

type Entry = {
  clientId: number;
  clock: number;
  /** The state as the JSON it arrived as. */
  state: string;
  /** True when that JSON is null, however it was spelled: the client is leaving. */
  retraction: boolean;
};

/**
 * An awareness update's entries. Throws on a state that isn't JSON, which is
 * before anything has been claimed or applied.
 */
function decodeEntries(update: Uint8Array): Entry[] {
  const decoder = decoding.createDecoder(update);
  const count = decoding.readVarUint(decoder);
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    const clientId = decoding.readVarUint(decoder);
    const clock = decoding.readVarUint(decoder);
    const state = decoding.readVarString(decoder);
    entries.push({ clientId, clock, state, retraction: JSON.parse(state) === null });
  }
  return entries;
}

function encodeEntries(entries: Entry[]): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, entries.length);
  for (const entry of entries) {
    encoding.writeVarUint(encoder, entry.clientId);
    encoding.writeVarUint(encoder, entry.clock);
    encoding.writeVarString(encoder, entry.state);
  }
  return encoding.toUint8Array(encoder);
}

/**
 * Whether this socket may send this entry, claiming its client id if nobody
 * has.
 *
 * A retraction can't claim one. That is the entry an honest client sends about
 * somebody else, and letting it take the id would lock that person's cursor
 * out if they came back.
 */
function claim(room: Room, socket: AwarenessSocket, { clientId, retraction }: Entry): boolean {
  const owner = room.owners.get(clientId);
  if (owner) {
    if (owner.key !== socket.presenceKey) return false;
    owner.sockets.add(socket.id);
    socket.awarenessClients.add(clientId);
    return true;
  }

  if (retraction) return false;
  if (socket.awarenessClients.size >= MAX_CLIENT_IDS_PER_SOCKET) return false;
  room.owners.set(clientId, { key: socket.presenceKey, sockets: new Set([socket.id]) });
  socket.awarenessClients.add(clientId);
  return true;
}

/**
 * Apply a client's awareness update, keeping only the entries that are its own.
 *
 * Returns the bytes to relay to the rest of the room: the update as it arrived
 * when all of it was the sender's, a re-encoded one when part of it was, and
 * null when none of it was. An honest client does send entries for other
 * people — y-protocols retracts a peer it hasn't heard from in 30 seconds, and
 * the client relays that — so a partial update is ordinary, not an attack.
 *
 * Throws on bytes that aren't an awareness update.
 */
export function applyClientAwareness(
  boardId: string,
  update: Uint8Array,
  socket: AwarenessSocket,
): Uint8Array | null {
  const room = registry.get(boardId);
  if (!room) return null;

  const entries = decodeEntries(update);
  const own = entries.filter((entry) => claim(room, socket, entry));
  if (own.length === 0) return null;

  const allowed = own.length === entries.length ? update : encodeEntries(own);
  applyAwarenessUpdate(room.awareness, allowed, socket.id);
  return allowed;
}

/**
 * Let go of a departed socket's client ids, and retract the ones nobody else
 * holds. A client that has already reconnected holds its id through the new
 * socket, so its cursor stays put rather than blinking out when the old
 * socket finally times out.
 */
export function releaseClients(boardId: string, socket: AwarenessSocket): void {
  const room = registry.get(boardId);
  if (!room) return;

  const gone: number[] = [];
  for (const clientId of socket.awarenessClients) {
    const owner = room.owners.get(clientId);
    if (!owner) continue;
    owner.sockets.delete(socket.id);
    if (owner.sockets.size > 0) continue;
    room.owners.delete(clientId);
    gone.push(clientId);
  }
  socket.awarenessClients.clear();

  if (gone.length > 0) removeAwarenessStates(room.awareness, gone, SERVER_ORIGIN);
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

/** Drop a board's awareness once its room is empty. */
export function releaseAwareness(boardId: string): void {
  const room = registry.get(boardId);
  if (!room) return;
  room.awareness.destroy();
  registry.delete(boardId);
}

/** Test seam. */
export function resetAwarenessRegistry(): void {
  for (const room of registry.values()) room.awareness.destroy();
  registry.clear();
}
