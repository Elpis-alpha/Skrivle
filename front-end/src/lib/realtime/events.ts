// Mirrors back-end/src/protocol/events.ts.
//
// Kept in sync by hand — the monorepo forbids cross-folder imports (CLAUDE.md).
//
// The board is chosen in the HANDSHAKE, not by an event:
//
//   io(url, { auth: { boardId, name, presenceKey }, withCredentials: true })
//
// so a socket belongs to exactly one board for its lifetime and cannot hop
// rooms. `presenceKey` is a random string kept for the session and sent nowhere
// else: a socket may only send awareness for its own client id, and the key is
// what lets a reconnect, which is a new socket, carry on with the same one. The session cookie rides the handshake, which is what gives a cursor a
// real name.
//
// Sync is the standard Yjs two-step exchange:
//
//   server -> client   sync:step    server's state vector
//   client -> server   sync:update  everything the server is missing
//   client -> server   sync:step    client's state vector
//   server -> client   sync:update  everything the client is missing
//
// Each socket is rate limited. An awareness update over the limit is dropped; a
// sync:update over it is dropped too, and about a second later the server
// sends sync:step again, which is answered as it is on join.
//
// Payloads are raw binary. The server emits Uint8Array; the browser hands them
// back as ArrayBuffer, so every inbound payload goes through toBytes().

export const EVENTS = {
  BOARD_JOINED: "board:joined",
  SYNC_STEP: "sync:step",
  SYNC_UPDATE: "sync:update",
  AWARENESS_UPDATE: "awareness:update",
  ERROR: "error:named",
} as const;

/** Reasons a handshake can be refused, as sent in connect_error.message. */
export const HANDSHAKE_ERRORS = {
  NO_BOARD: "no_board",
  NOT_FOUND: "board_not_found",
  EXPIRED: "board_expired",
  FAILED: "handshake_failed",
} as const;

export type HandshakeError =
  (typeof HANDSHAKE_ERRORS)[keyof typeof HANDSHAKE_ERRORS];

/** Server-assigned presence colour. `base` fills the arrow, `label` the name tag. */
export type WireColor = { name: string; base: string; label: string };

export type BoardJoined = {
  boardId: string;
  color: WireColor;
  you: { id: string | null; name: string; signedIn: boolean };
};

export type NamedError = { message: string; next: string };

/**
 * The most the server takes in one update: a whole board (its MAX_BOARD_BYTES).
 * Socket.IO's maxHttpBufferSize is twice that.
 */
export const MAX_UPDATE_BYTES = 4 * 1024 * 1024;
