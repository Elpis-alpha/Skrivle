// Keyed hashing for the three secrets Skrivle hands out: session ids, sign-in
// codes, and board creator tokens.
//
// Every one is a high-entropy random token rather than a user-chosen password,
// so a slow KDF (argon2/bcrypt) buys nothing — there is no dictionary to walk.
// What matters instead is that the stored form is useless on its own, which is
// what keying the hash with SESSION_SECRET achieves: a dump of Redis or
// Postgres without the server's secret yields nothing replayable.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { config } from "../config/env.js";

/** HMAC-SHA256 of `value`, peppered with SESSION_SECRET. Hex-encoded. */
export function hashToken(value: string): string {
  return createHmac("sha256", config.sessionSecret).update(value).digest("hex");
}

/** A URL-safe random token. 32 bytes = 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Constant-time comparison of two hex digests. Falls out early on a length
 * mismatch, which leaks nothing: our digests are always the same length, so an
 * unequal length means malformed input rather than a near-miss guess.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Compare a plaintext token against a stored digest, in constant time. */
export function verifyToken(plain: string, digest: string): boolean {
  return safeEqual(hashToken(plain), digest);
}

/**
 * A numeric one-time code, zero-padded to `digits`.
 *
 * Drawn with randomInt over the whole range rather than digit-by-digit or via
 * a modulo of random bytes — both of those skew the distribution. The UI
 * (front-end SignInForm) accepts digits only, so this must stay numeric.
 */
export function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, "0");
}
