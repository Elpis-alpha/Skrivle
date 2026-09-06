// Socket.IO gateway — docs/ARCHITECTURE.md#real-time-sync-model.
//
// Room management and awareness relay work today. Document sync is handed to
// yjs-bridge.ts (stub) and persistence to snapshot-writer.ts (stub).
import type { Server as HttpServer } from "node:http";
import { Server as IOServer } from "socket.io";
import { config } from "../config/env.js";
import { EVENTS } from "../protocol/events.js";
import {
  markDirty,
  releaseDoc,
  trackSocket,
  untrackSocket,
} from "./doc-manager.js";

/** Socket.IO room name for a board. */
export function roomFor(boardId: string): string {
  return `board:${boardId}`;
}

export function attachGateway(httpServer: HttpServer): IOServer {
  const io = new IOServer(httpServer, {
    path: "/socket.io",
    cors: { origin: config.corsOrigin, credentials: true },
  });

  io.on("connection", (socket) => {
    // TODO(Phase 1): authenticate the socket (session cookie or creator token)
    // and read the board id from the handshake instead of trusting the event.
    let boardId: string | null = null;

    socket.on(EVENTS.JOIN_BOARD, (requestedBoardId: string) => {
      // TODO(Phase 1): validate the id, check the board exists and that this
      // user may edit it, then call yjs-bridge.sendInitialSync(socket, doc).
      boardId = requestedBoardId;
      socket.join(roomFor(boardId));
      trackSocket(boardId, socket.id);
      socket.emit(EVENTS.BOARD_JOINED, { boardId });
    });

    socket.on(EVENTS.SYNC_UPDATE, () => {
      if (!boardId) return;
      // TODO(Phase 1): yjs-bridge.applyClientUpdate(io, boardId, doc, update) —
      // apply to the in-memory doc and broadcast to the rest of the room.
      markDirty(boardId);
    });

    socket.on(EVENTS.AWARENESS_UPDATE, (state: unknown) => {
      if (!boardId) return;
      // Awareness is relay-only and never persisted (ARCHITECTURE.md).
      socket.to(roomFor(boardId)).emit(EVENTS.AWARENESS_UPDATE, state);
    });

    socket.on("disconnect", () => {
      if (!boardId) return;
      const roomEmpty = untrackSocket(boardId, socket.id);
      if (roomEmpty) {
        // TODO(Phase 1): await snapshot-writer.persistSnapshot(boardId) first.
        releaseDoc(boardId);
      }
    });
  });

  return io;
}
