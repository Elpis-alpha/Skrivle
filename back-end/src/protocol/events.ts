// Socket.IO wire protocol for board collaboration.
// docs/ARCHITECTURE.md#real-time-sync-model
//
// Rooms: one per board, named `board:<id>` (realtime/yjs-bridge.roomFor).
//
// The board is chosen in the **handshake**, not by an event:
//
//   io(url, { auth: { boardId, name, presenceKey }, withCredentials: true })
//
// so a socket belongs to exactly one board for its lifetime and cannot hop
// between rooms. `presenceKey` is optional: a random string of 16 to 64
// characters that a client keeps for its session and sends nowhere else. A
// socket may only send awareness for its own client ids, and the key is what
// lets a reconnect, which is a new socket, carry on with the same one. The session cookie rides along on the handshake, which is what
// gives a cursor a real name. A handshake that names a missing or expired board
// is refused with connect_error carrying one of: no_board, board_not_found,
// board_expired, handshake_failed.
//
// Sync is the standard Yjs two-step exchange, over these events:
//
//   server -> client   sync:step    server's state vector
//   client -> server   sync:update  everything the server is missing
//   client -> server   sync:step    client's state vector
//   server -> client   sync:update  everything the client is missing
//
// Thereafter the change each sync:update makes to the board is relayed to the
// rest of the room. One that changes nothing — a repeat — is relayed to nobody.
//
// Client -> server
//   sync:step         (stateVector: Uint8Array)  "here is what I have"
//   sync:update       (update: Uint8Array)       a Yjs document update
//   awareness:update  (update: Uint8Array)       a Yjs awareness update (ephemeral)
//
// Server -> client
//   board:joined      ({ boardId, color, you })  room joined; sync follows
//   sync:step         (stateVector: Uint8Array)  server state vector (sync step 1)
//   sync:update       (update: Uint8Array)       document updates, fanned out
//   awareness:update  (update: Uint8Array)       peers' cursors, including
//                                                server-issued retractions when
//                                                someone disconnects
//   error:named       ({ message, next })        something went wrong; next step named
//
// Each socket is rate limited (realtime/limits.ts). An awareness update over
// the limit is dropped. A sync:update over it is dropped too, and about a
// second later the server sends sync:step again, which the client answers as
// it does on join — so nothing it drew is lost, only late. The same follows an
// update that leaned on one the server never got, and one refused because the
// board was full once there is room again.
//
// The server may close a socket itself (a board that fails to load, or is
// deleted while open). socket.io-client doesn't retry after that, so the client
// reconnects on its own; a board that is gone then refuses the handshake.

export const EVENTS = {
  BOARD_JOINED: "board:joined",
  SYNC_STEP: "sync:step",
  SYNC_UPDATE: "sync:update",
  AWARENESS_UPDATE: "awareness:update",
  ERROR: "error:named",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/** Reasons a handshake can be refused, as sent in connect_error.message. */
export const HANDSHAKE_ERRORS = {
  NO_BOARD: "no_board",
  NOT_FOUND: "board_not_found",
  EXPIRED: "board_expired",
  FAILED: "handshake_failed",
} as const;
