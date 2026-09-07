// One-time sign-in codes.
//
// Six numeric digits, because the front-end's segmented input
// (front-end/src/components/auth/SignInForm.tsx) accepts digits only and is
// fixed at six slots. Six digits is a 1,000,000-wide space; what makes that
// safe is not the width but the attempt cap — five wrong guesses burn the code
// entirely, so an attacker gets five draws per ten-minute window, not unlimited.
import { generateNumericCode, hashToken, safeEqual } from "./hash.js";
import { keys, TTL } from "../redis/keys.js";
import { redis } from "../redis/client.js";

export const CODE_LENGTH = 6;
export const MAX_ATTEMPTS = 5;

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "mismatch" | "exhausted" };

/** Lowercase and trim, so casing never forks one person into two accounts. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Whether a code was sent to this address too recently to send another.
 * The UI exposes a Resend button, so this is a normal path, not an error.
 */
export async function inCooldown(email: string): Promise<boolean> {
  return (await redis.exists(keys.otpCooldown(normalizeEmail(email)))) === 1;
}

/**
 * Create and store a code, returning the plaintext for the mail template.
 * Only its HMAC is stored, so a Redis dump does not hand over live codes.
 */
export async function issueCode(email: string): Promise<string> {
  const address = normalizeEmail(email);
  const code = generateNumericCode(CODE_LENGTH);

  await redis
    .multi()
    .hSet(keys.otp(address), {
      codeHash: hashToken(code),
      attempts: "0",
      sentAt: Date.now().toString(),
    })
    .expire(keys.otp(address), TTL.otp)
    .set(keys.otpCooldown(address), "1", { EX: TTL.otpResendCooldown })
    .exec();

  return code;
}

/**
 * Check a submitted code and consume it on success.
 *
 * The attempt counter lives with the code rather than in a rate-limit bucket:
 * it must survive independently of the limiter's fail-open behaviour, and it
 * has to be atomic, since two parallel guesses must not both count as one.
 */
export async function verifyCode(email: string, code: string): Promise<VerifyResult> {
  const address = normalizeEmail(email);
  const key = keys.otp(address);

  const stored = await redis.hGetAll(key);
  if (!stored.codeHash) return { ok: false, reason: "expired" };

  // Increment first: a guess that races another must still be counted.
  const attempts = await redis.hIncrBy(key, "attempts", 1);
  if (attempts > MAX_ATTEMPTS) {
    await redis.del(key);
    return { ok: false, reason: "exhausted" };
  }

  if (!safeEqual(hashToken(code), stored.codeHash)) {
    // The last permitted attempt being wrong burns the code immediately, so
    // the window does not stay open for a final guess.
    if (attempts >= MAX_ATTEMPTS) {
      await redis.del(key);
      return { ok: false, reason: "exhausted" };
    }
    return { ok: false, reason: "mismatch" };
  }

  // Single-use: the code is gone the moment it works.
  await redis.del(key);
  return { ok: true };
}
