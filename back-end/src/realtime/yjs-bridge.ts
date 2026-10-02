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
import { addBytes, hasRoom, markDirty } from "./doc-manager.js";
import { appendUpdate } from "./update-log.js";
import { EVENTS } from "../protocol/events.js";

/**
 * Reject anything larger than this in a single update.
 *
 * Socket.IO's own maxHttpBufferSize is the outer guard; this one exists so an
 * oversized frame is refused with a named error the client can act on, rather
 * than the connection being torn down with no explanation.
 */
export const MAX_UPDATE_BYTES = 1024 * 1024;

/**
 * The transport ceiling, deliberately well above MAX_UPDATE_BYTES.
 *
 * They used to be equal, which quietly made the named error above unreachable:
 * anything big enough to trip it was already killed by the buffer limit, with
 * no message at all. Worse, the one update a client legitimately sends at size
 * is the reconnect catch-up — encodeStateAsUpdate of everything drawn during an
 * outage. At an equal ceiling, a client that drew more than a megabyte offline
 * has every reconnect attempt dropped, forever, silently.
 */
export const MAX_FRAME_BYTES = 8 * 1024 * 1024;

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

/** Why an update was turned away, or that it wasn't. */
export type ApplyResult = "applied" | "too_large" | "board_full" | "invalid";

/**
 * Apply a client's update and fan it out to the rest of the board.
 *
 * The client's bytes are relayed verbatim rather than re-encoded from the
 * server's doc. Yjs updates are commutative and idempotent, so every peer
 * converges on the same document either way, and forwarding avoids re-encoding
 * the delta once per recipient.
 *
 * A full board still takes an update that only deletes. Refusing those would
 * leave nobody able to make room.
 */
export function applyClientUpdate(
  io: IOServer,
  boardId: string,
  doc: Y.Doc,
  update: Uint8Array,
  from: Socket,
): ApplyResult {
  if (update.byteLength > MAX_UPDATE_BYTES) return "too_large";

  try {
    if (!hasRoom(boardId, update.byteLength) && addsContent(update)) return "board_full";

    // The origin tags this change as coming from `from`, which keeps the
    // server's own update handlers from treating it as a local edit.
    Y.applyUpdate(doc, update, from.id);
  } catch {
    return "invalid";
  }

  addBytes(boardId, update.byteLength);
  markDirty(boardId);
  appendUpdate(boardId, update);
  io.to(roomFor(boardId)).except(from.id).emit(EVENTS.SYNC_UPDATE, update);
  return "applied";
}

/** Whether an update carries anything besides deletions. Throws on malformed bytes. */
function addsContent(update: Uint8Array): boolean {
  return Y.decodeUpdate(update).structs.length > 0;
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
