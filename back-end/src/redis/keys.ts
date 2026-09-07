// Every Redis key shape in one place, so the keyspace is readable at a glance
// and prefixes cannot drift apart across modules.
//
// Secrets are never keys in the clear: session ids and email addresses are
// hashed (auth/hash.ts) before they become part of a key, so `redis KEYS *` on
// a compromised box reveals neither a valid session token nor a user list.
import { hashToken } from "../auth/hash.js";

/** Seconds. Exported so tests and handlers agree on the same lifetimes. */
export const TTL = {
  /** Sliding: refreshed on every authenticated request. */
  session: 60 * 60 * 24 * 30,
  /** How long a sign-in code stays valid. */
  otp: 60 * 10,
  /** Minimum gap between "Resend code" sends for one address. */
  otpResendCooldown: 60,
  /** An OAuth round trip that takes longer than this has gone wrong. */
  oauthState: 60 * 10,
} as const;

export const keys = {
  /** Session record: { userId, createdAt, userAgent }. */
  session: (sessionId: string) => `sess:${hashToken(sessionId)}`,

  /**
   * Set of a user's live session keys, so "sign out everywhere" and account
   * deletion can revoke without scanning the keyspace.
   */
  userSessions: (userId: string) => `usess:${userId}`,

  /** Pending sign-in code: { codeHash, attempts, sentAt }. */
  otp: (email: string) => `otp:${hashToken(email)}`,

  /** Presence of this key means "a code was sent too recently to send again". */
  otpCooldown: (email: string) => `otpcool:${hashToken(email)}`,

  /**
   * One-shot OAuth handshake state: { provider, verifier, returnTo, claimBoardId }.
   * The state value is already random and single-use, so it is not hashed.
   */
  oauthState: (state: string) => `oauth:${state}`,

  /** Rate-limit counter. `subject` is an email hash, an IP, or a session id. */
  rateLimit: (bucket: string, subject: string) => `rl:${bucket}:${subject}`,
} as const;
