// What one socket may send, and how big a board may get.
//
// Anyone with a board's link may edit it, so the link is the only thing between
// the public and this process. Nothing here is about who you are: it bounds
// what a single connection can cost everyone else on the board.
//
// The buckets are per socket and in memory. A socket lives in exactly one
// process, so there is nothing to share through Redis, and a counter there
// would be a round trip per pointer sample.
import { rateLimitScale } from "../config/env.js";

export type BucketRule = {
  /** The most a socket can send in one burst. */
  capacity: number;
  /** How fast the allowance comes back. */
  perSecond: number;
};

export type Bucket = { tokens: number; at: number };

/** Always 1 in production; see rateLimitScale. */
const per = (rule: BucketRule): BucketRule => ({
  capacity: rule.capacity * rateLimitScale,
  perSecond: rule.perSecond * rateLimitScale,
});

/**
 * Sized against what the client really sends. It writes to the doc every
 * PUBLISH_MS (50ms), so one gesture is 20 updates a second, and a cursor is 20
 * awareness updates a second on top of that. The rates sit at two to three
 * times that; the capacities ride out a burst such as a queue flushing after a
 * stall.
 */
export const SOCKET_RULES = {
  syncUpdate: per({ capacity: 240, perSecond: 60 }),
  /**
   * The same updates, by weight: bytes, not messages. Drawing is a few
   * kilobytes a second. The capacity is two boards' worth, so a client catching
   * up after a long time offline can send everything it has in one go.
   */
  syncBytes: per({ capacity: 8 * 1024 * 1024, perSecond: 512 * 1024 }),
  /**
   * Tight on purpose. A state vector is a few bytes that the server answers
   * with up to the whole board, and a client only sends one per connection.
   */
  syncStep: per({ capacity: 5, perSecond: 0.2 }),
  awareness: per({ capacity: 120, perSecond: 40 }),
} as const satisfies Record<string, BucketRule>;

export function newBucket(rule: BucketRule, now = Date.now()): Bucket {
  return { tokens: rule.capacity, at: now };
}

/** Spend `cost` tokens. False, and nothing spent, when the socket hasn't that many. */
export function take(bucket: Bucket, rule: BucketRule, cost = 1, now = Date.now()): boolean {
  const elapsed = Math.max(0, now - bucket.at) / 1000;
  bucket.tokens = Math.min(rule.capacity, bucket.tokens + elapsed * rule.perSecond);
  bucket.at = now;
  if (bucket.tokens < cost) return false;
  bucket.tokens -= cost;
  return true;
}

/**
 * How long after dropping an update the server asks its sender to resync. Long
 * enough for the bucket to have refilled, so the answer itself gets through.
 */
export const RESYNC_AFTER_MS = 1000;

/**
 * A board's ceiling, as its encoded Yjs state.
 *
 * Every join sends the whole board and every snapshot rewrites it, so an
 * unbounded one is a cost paid by everyone who opens it. Four megabytes is
 * thousands of pen strokes. It is also the most one update may be
 * (MAX_UPDATE_BYTES), so a client holding a whole board the server has lost can
 * still send it, and it sits under MAX_FRAME_BYTES so that frame gets through.
 */
export const MAX_BOARD_BYTES = 4 * 1024 * 1024;

/**
 * One awareness update: a name, an avatar URL, a cursor and up to fifty
 * selected ids come to about two kilobytes. Relayed to the whole room, so the
 * ceiling is what stops one socket making everyone carry a megabyte of "state".
 */
export const MAX_AWARENESS_BYTES = 16 * 1024;

/**
 * Awareness client ids one socket may introduce. A client has one for its
 * whole session; the second is slack, not a feature.
 */
export const MAX_CLIENT_IDS_PER_SOCKET = 2;
