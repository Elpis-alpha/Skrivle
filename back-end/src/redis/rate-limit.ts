// Fixed-window rate limiting on Redis, plus the Express middleware that wraps it.
//
// Fixed-window (INCR + EXPIRE) rather than a sliding log or token bucket: it is
// two commands and one key, and its only real weakness — up to 2x the limit
// across a window boundary — does not matter for the things being limited here
// (sign-in email sends, board creation, id enumeration).
import type { NextFunction, Request, Response } from "express";
import { hashToken } from "../auth/hash.js";
import { keys } from "./keys.js";
import { redis } from "./client.js";

export type RateLimitRule = {
  /** Namespace for the counter — appears in the key. */
  bucket: string;
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  resetAfter: number;
};

/**
 * Count one hit against `rule` for `subject`.
 *
 * Fails **open** when Redis is unreachable. That is a deliberate trade: the
 * alternative locks every user out of sign-in during a Redis blip, and the
 * endpoints this guards are throttles against nuisance, not the last line of
 * defence. The genuinely security-critical counter — wrong-code attempts — is
 * stored alongside the code itself, and if Redis is down there is no code to
 * verify against in the first place, so nothing is weakened by failing open.
 */
export async function consume(
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  const key = keys.rateLimit(rule.bucket, subject);
  try {
    const count = await redis.incr(key);
    // Only the first hit sets the TTL, so the window starts at the first
    // request rather than sliding forward with every one.
    if (count === 1) await redis.expire(key, rule.windowSeconds);

    const ttl = await redis.ttl(key);
    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetAfter: ttl > 0 ? ttl : rule.windowSeconds,
    };
  } catch (err) {
    console.error(
      `[skrivle] rate limit check failed for ${rule.bucket}; allowing:`,
      err instanceof Error ? err.message : err,
    );
    return { allowed: true, remaining: rule.limit, resetAfter: rule.windowSeconds };
  }
}

/** Drop a counter early — used when a sign-in succeeds and the failures no longer matter. */
export async function reset(rule: RateLimitRule, subject: string): Promise<void> {
  try {
    await redis.del(keys.rateLimit(rule.bucket, subject));
  } catch {
    /* a stale counter expires on its own */
  }
}

/**
 * The client IP. Express only trusts X-Forwarded-For when `trust proxy` is set
 * (server.ts sets it in production, where Nginx is the only thing in front),
 * so this cannot be spoofed by a direct caller.
 */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/** Rate-limit by client IP. */
export function limitByIp(rule: RateLimitRule) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await consume(rule, hashToken(clientIp(req)));
    applyHeaders(res, rule, result);
    if (!result.allowed) {
      tooMany(res, result);
      return;
    }
    next();
  };
}

function applyHeaders(res: Response, rule: RateLimitRule, result: RateLimitResult): void {
  res.setHeader("RateLimit-Limit", rule.limit);
  res.setHeader("RateLimit-Remaining", result.remaining);
  res.setHeader("RateLimit-Reset", result.resetAfter);
}

/** STYLE_GUIDE.md §10.3 — say what happened and what to do next. */
export function tooMany(res: Response, result: RateLimitResult): void {
  const minutes = Math.max(1, Math.ceil(result.resetAfter / 60));
  res.setHeader("Retry-After", result.resetAfter);
  res.status(429).json({
    error: {
      message: "That's more requests than this endpoint allows right now.",
      next: `Wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`,
    },
  });
}

/** The rules themselves, named so routes read declaratively. */
export const RULES = {
  otpRequestPerEmail: { bucket: "otp:email", limit: 5, windowSeconds: 3600 },
  otpRequestPerIp: { bucket: "otp:ip", limit: 20, windowSeconds: 3600 },
  otpVerifyPerIp: { bucket: "otpv:ip", limit: 30, windowSeconds: 3600 },
  boardCreatePerIp: { bucket: "board:new", limit: 30, windowSeconds: 3600 },
  availabilityPerIp: { bucket: "board:avail", limit: 60, windowSeconds: 60 },
  uploadSignPerSession: { bucket: "upload:sign", limit: 60, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;
