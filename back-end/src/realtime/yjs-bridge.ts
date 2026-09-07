// The Socket.IO <-> Yjs bridge: the sync handshake and update fan-out.
//
// There is no y-websocket here because the transport is Socket.IO, so the sync
// protocol is implemented directly. It is the standard two-step exchange:
//
//   server -> client   sync:step    server's state vector
//   client -> server   sync:update  everything the server is missing
//   client -> server   sync:step    client's state vector
//   server -> client   sync:update  everything the client is missing
//
// State vectors rather than whole documents keep the handshake proportional to
// what actually differs, so rejoining a large board is cheap.
import type { Server as IOServer, Socket } from "socket.io";
import * as Y from "yjs";
import { markDirty } from "./doc-manager.js";
import { EVENTS } from "../protocol/events.js";

/**
 * Reject anything larger than this in a single update.
 *
 * Socket.IO's own maxHttpBufferSize is the outer guard; this one exists so an
 * oversized frame is refused with a named error the client can act on, rather
 * than the connection being torn down with no explanation.
 */
export const MAX_UPDATE_BYTES = 1024 * 1024;

/** Open the handshake by advertising what the server already has. */
export function sendInitialSync(socket: Socket, doc: Y.Doc): void {
  socket.emit(EVENTS.SYNC_STEP, Y.encodeStateVector(doc));
}

/**
 * Answer a client's state vector with exactly the updates it lacks.
 * A malformed vector must not take the process down, so decoding is guarded.
 */
export function sendMissingUpdates(socket: Socket, doc: Y.Doc, stateVector: Uint8Array): void {
  let diff: Uint8Array;
  try {
    diff = Y.encodeStateAsUpdate(doc, stateVector);
  } catch {
    // Fall back to the whole document rather than leaving the client unsynced.
    diff = Y.encodeStateAsUpdate(doc);
  }
  socket.emit(EVENTS.SYNC_UPDATE, diff);
}

/**
 * Apply a client's update and fan it out to the rest of the board.
 *
 * The client's bytes are relayed verbatim rather than re-encoded from the
 * server's doc. Yjs updates are commutative and idempotent, so every peer
 * converges on the same document either way, and forwarding avoids re-encoding
 * the delta once per recipient.
 *
 * Returns false when the update was rejected.
 */
export function applyClientUpdate(
  io: IOServer,
  boardId: string,
  doc: Y.Doc,
  update: Uint8Array,
  from: Socket,
): boolean {
  if (update.byteLength > MAX_UPDATE_BYTES) return false;

  try {
    // The origin tags this change as coming from `from`, which keeps the
    // server's own update handlers from treating it as a local edit.
    Y.applyUpdate(doc, update, from.id);
  } catch {
    return false;
  }

  markDirty(boardId);
  io.to(roomFor(boardId)).except(from.id).emit(EVENTS.SYNC_UPDATE, update);
  return true;
}

/** Socket.IO room name for a board. */
export function roomFor(boardId: string): string {
  return `board:${boardId}`;
}

/** Coerce a wire payload to bytes, or null if it is not a binary frame. */
export function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  return null;
}
