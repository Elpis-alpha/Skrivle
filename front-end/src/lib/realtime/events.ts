// Mirrors back-end/src/protocol/events.ts.
//
// Kept in sync by hand — the monorepo forbids cross-folder imports (CLAUDE.md).
//
// The board is chosen in the HANDSHAKE, not by an event:
//
//   io(url, { auth: { boardId, name }, withCredentials: true })
//
// so a socket belongs to exactly one board for its lifetime and cannot hop
// rooms. The session cookie rides the handshake, which is what gives a cursor a
// real name.
//
// Sync is the standard Yjs two-step exchange:
//
//   server -> client   sync:step    server's state vector
//   client -> server   sync:update  everything the server is missing
//   client -> server   sync:step    client's state vector
//   server -> client   sync:update  everything the client is missing
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

/** The server's 1 MiB cap, also Socket.IO's maxHttpBufferSize. */
export const MAX_UPDATE_BYTES = 1024 * 1024;
