// Socket.IO wire protocol for board collaboration.
// docs/ARCHITECTURE.md#real-time-sync-model
//
// Rooms: one per board, named `board:<id>` (realtime/gateway.roomFor).
//
// Client -> server
//   board:join        (boardId: string)          ask to join a board room
//   sync:update       (update: Uint8Array)       a Yjs document update
//   awareness:update  (state: Uint8Array)        a Yjs awareness update (ephemeral)
//
// Server -> client
//   board:joined      ({ boardId })              room joined; sync follows
//   sync:step         (stateVector: Uint8Array)  server state vector (sync step 1)
//   sync:update       (update: Uint8Array)       a peer's document update, fanned out
//   awareness:update  (state: Uint8Array)        a peer's awareness update
//   error:named       ({ message, next })        something went wrong; next step named

export const EVENTS = {
  JOIN_BOARD: "board:join",
  BOARD_JOINED: "board:joined",
  SYNC_STEP: "sync:step",
  SYNC_UPDATE: "sync:update",
  AWARENESS_UPDATE: "awareness:update",
  ERROR: "error:named",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
