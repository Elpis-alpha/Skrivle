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
import { addBytes, hasRoom, markDirty, peekDoc } from "./doc-manager.js";
import { MAX_BOARD_BYTES } from "./limits.js";
import { appendUpdate } from "./update-log.js";
import { EVENTS } from "../protocol/events.js";

/**
 * Reject anything larger than this in a single update: a whole board.
 *
 * The one update a client legitimately sends at size is its catch-up — its
 * answer to the server's state vector, which is everything it drew while
 * disconnected, or the whole board if the server has lost it. A ceiling below a
 * board's would refuse that on every reconnect, for ever, and a refused update
 * holds back everything the client sends after it.
 */
export const MAX_UPDATE_BYTES = MAX_BOARD_BYTES;

/**
 * The transport ceiling, deliberately well above MAX_UPDATE_BYTES.
 *
 * At an equal ceiling the named error for an oversized update is unreachable:
 * anything big enough to trip it has its connection torn down by Socket.IO's
 * buffer limit first, with no message at all.
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

export type ApplyResult = {
  /** Why the update was turned away, or that it wasn't. */
  status: "applied" | "too_large" | "board_full" | "invalid";
  /**
   * True when the update leaned on something the server doesn't have — an
   * earlier update of this client's that was dropped or refused. The sender
   * needs asking for what is missing.
   */
  behind: boolean;
};

const refused = (status: ApplyResult["status"]): ApplyResult => ({ status, behind: false });

/**
 * Apply a client's update and fan out what it changed.
 *
 * What is relayed and logged is the change the doc reports, not the bytes that
 * arrived. They are the same for an honest update, and re-encoding costs one
 * pass per update rather than one per recipient. The difference is everything
 * else: an update the server already has changes nothing and so goes nowhere,
 * and one that is only partly usable passes on only the part that was.
 *
 * Nothing is left pending. Yjs keeps what it can't integrate yet — structs
 * whose predecessors are missing, deletions of items it hasn't seen — and
 * would hold it for ever if the missing piece never came, in memory and in
 * every snapshot. Here the missing piece is always the sender's to supply, so
 * the leftovers are discarded and the caller asks the sender to resync, which
 * brings all of it back in one update.
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
  // The board was deleted with this socket still on it.
  if (peekDoc(boardId) !== doc) return refused("invalid");
  if (update.byteLength > MAX_UPDATE_BYTES) return refused("too_large");

  let adds: boolean;
  try {
    // Decoding reads the whole update, so this is also what turns away bytes
    // that would throw halfway through being applied.
    adds = addsContent(update);
  } catch {
    return refused("invalid");
  }
  if (adds && !hasRoom(boardId, update.byteLength)) {
    // Measured against what the server lacks, not what arrived. A catch-up
    // repeats a great deal the board already holds, and that takes no room.
    const fresh = Y.diffUpdate(update, Y.encodeStateVector(doc));
    if (!hasRoom(boardId, fresh.byteLength)) return refused("board_full");
  }

  const changes: Uint8Array[] = [];
  const capture = (change: Uint8Array) => changes.push(change);
  let status: ApplyResult["status"] = "applied";
  doc.on("update", capture);
  try {
    // The origin tags this change as coming from `from`, which keeps the
    // server's own update handlers from treating it as a local edit.
    Y.applyUpdate(doc, update, from.id);
  } catch {
    // Whatever it integrated before throwing is in the doc now, and was
    // captured, so it is still saved and relayed below.
    status = "invalid";
  } finally {
    doc.off("update", capture);
  }

  const behind = doc.store.pendingStructs !== null || doc.store.pendingDs !== null;
  doc.store.pendingStructs = null;
  doc.store.pendingDs = null;

  if (changes.length > 0) {
    const change = changes.length === 1 ? changes[0]! : Y.mergeUpdates(changes);
    addBytes(boardId, change.byteLength);
    markDirty(boardId);
    appendUpdate(boardId, change);
    io.to(roomFor(boardId)).except(from.id).emit(EVENTS.SYNC_UPDATE, change);
  }
  return { status, behind };
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
