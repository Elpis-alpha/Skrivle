// Sessions: an opaque random token in an HttpOnly cookie, backed by Redis.
//
// Why not a JWT: sign-out, "sign out everywhere", and account deletion all need
// a session to stop working *now*. A stateless token cannot be revoked before
// it expires, and the socket gateway authenticates from the same session, so a
// stale token would keep a live editing connection open after sign-out.
//
// Redis is the natural store: TTL is native (no expiry sweep to write), and the
// read path is one command. Only the token's HMAC is stored — see ./hash.ts.
import type { Request, Response } from "express";
import { hashToken, randomToken } from "./hash.js";
import { config } from "../config/env.js";
import { keys, TTL } from "../redis/keys.js";
import { redis } from "../redis/client.js";

export const SESSION_COOKIE = "skrivle_session";

export type SessionRecord = {
  userId: string;
  createdAt: string;
  userAgent?: string;
};

/**
 * Mint a session and return the raw token. The caller puts it in a cookie; it
 * is never stored anywhere in this form, so this is the only chance to read it.
 */
export async function createSession(userId: string, userAgent?: string): Promise<string> {
  const sessionId = randomToken();
  const record: SessionRecord = {
    userId,
    createdAt: new Date().toISOString(),
    ...(userAgent ? { userAgent: userAgent.slice(0, 200) } : {}),
  };

  await redis
    .multi()
    .set(keys.session(sessionId), JSON.stringify(record), { EX: TTL.session })
    // The index of a user's live sessions, so revocation never has to SCAN.
    .sAdd(keys.userSessions(userId), hashToken(sessionId))
    .expire(keys.userSessions(userId), TTL.session)
    .exec();

  return sessionId;
}

/**
 * Resolve a session token, sliding its expiry forward.
 *
 * The refresh means an active user is never signed out mid-session, while
 * someone who stops using Skrivle is dropped 30 days later.
 */
export async function readSession(sessionId: string | undefined): Promise<SessionRecord | null> {
  if (!sessionId) return null;

  try {
    const raw = await redis.get(keys.session(sessionId));
    if (!raw) return null;

    const record = JSON.parse(raw) as SessionRecord;
    await redis.expire(keys.session(sessionId), TTL.session);
    return record;
  } catch {
    // A Redis outage means nobody is signed in, rather than everyone being
    // signed in. Failing closed is the only safe direction here.
    return null;
  }
}

/** Revoke one session. */
export async function destroySession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  const record = await readSession(sessionId);
  const ops = redis.multi().del(keys.session(sessionId));
  if (record) ops.sRem(keys.userSessions(record.userId), hashToken(sessionId));
  await ops.exec();
}

/** Revoke every session a user holds — sign out everywhere, or account deletion. */
export async function destroyAllSessions(userId: string): Promise<number> {
  const hashes = await redis.sMembers(keys.userSessions(userId));
  if (hashes.length === 0) return 0;

  // The set stores hashes, which are exactly the session key suffixes, so the
  // keys can be rebuilt without ever having seen the raw tokens.
  await redis
    .multi()
    .del(hashes.map((hash) => `sess:${hash}`))
    .del(keys.userSessions(userId))
    .exec();

  return hashes.length;
}

/**
 * Cookie attributes.
 *
 * No `domain`: the cookie stays host-only on the API and is never sent to the
 * front-end origin, which has no use for it.
 *
 * SameSite=Lax rather than None, because skrivle.elpis.cc and
 * api.skrivle.elpis.cc share the registrable domain elpis.cc — they are
 * same-*site* despite being different origins, so Lax cookies ride along on
 * both the front-end's credentialed fetches and the OAuth callback redirect.
 * Locally, localhost:3000 to localhost:4000 is same-site for the same reason.
 */
function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: TTL.session * 1000,
  };
}

export function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE, sessionId, cookieOptions());
}

export function clearSessionCookie(res: Response): void {
  const { maxAge: _maxAge, ...rest } = cookieOptions();
  res.clearCookie(SESSION_COOKIE, rest);
}

/** The raw session token from a request's cookies, if present. */
export function sessionIdFrom(req: Request): string | undefined {
  const value: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
