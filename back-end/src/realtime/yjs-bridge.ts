// Socket.IO <-> Yjs bridge — docs/ARCHITECTURE.md#real-time-sync-model.
//
// The client and server each hold a Y.Doc replica and exchange binary updates.
// This module will translate between the Socket.IO events in
// src/protocol/events.ts and Yjs' sync + awareness protocols. Transport is
// Socket.IO (not raw WebSocket), so there is no y-websocket — this bridge is
// the custom glue.
//
// TODO(Phase 1):
//   - onJoin: send sync step 1 (Y.encodeStateVector) so the client can diff,
//     then send sync step 2 (Y.encodeStateAsUpdate against the client's vector)
//   - onClientUpdate: Y.applyUpdate(doc, update, origin), mark the board dirty,
//     and broadcast the re-encoded update to the rest of the room
//   - onAwarenessUpdate: decode with y-protocols/awareness and relay only
//     (awareness is never persisted)
//   - payloads are Uint8Array; Socket.IO frames binary natively
import type { Server as IOServer, Socket } from "socket.io";
import type * as Y from "yjs";

export function sendInitialSync(_socket: Socket, _doc: Y.Doc): void {
  throw new Error("yjs-bridge.sendInitialSync is not implemented yet (Phase 1).");
}

export function applyClientUpdate(
  _io: IOServer,
  _boardId: string,
  _doc: Y.Doc,
  _update: Uint8Array,
): void {
  throw new Error(
    "yjs-bridge.applyClientUpdate is not implemented yet (Phase 1).",
  );
}
