// Redis client singleton. Connection string: config.redisUrl (REDIS_URL).
//
// Redis holds everything short-lived and TTL-shaped — sessions, sign-in codes,
// OAuth handshake state, rate-limit counters — so that none of it lands in
// Postgres as a high-churn table. The key layout lives in ./keys.ts.
import { createClient } from "redis";
import { config } from "../config/env.js";

export const redis = createClient({
  url: config.redisUrl,
  socket: {
    // Back off to one attempt every 5s rather than spamming reconnects.
    reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
  },
});

// node-redis throws on an unhandled error event. It keeps reconnecting on its
// own (see reconnectStrategy), so logging is enough here.
redis.on("error", (err) => {
  console.error("[skrivle] Redis error:", err instanceof Error ? err.message : err);
});

/**
 * Open the connection. node-redis needs an explicit connect before commands.
 * Fire-and-forget: a missing Redis must not block boot (same stance as the
 * rest of the scaffold), and the client reconnects once Redis is reachable.
 * `/healthz` reports the live state.
 */
export function connectRedis(): void {
  if (redis.isOpen) return;
  redis.connect().then(
    () => console.log("[skrivle] Redis connected"),
    () => {
      /* logged by the "error" handler; reconnectStrategy keeps trying */
    },
  );
}

/**
 * A second connection. Subscriber mode monopolises a connection in Redis, so
 * pub/sub needs its own — which is what a Socket.IO scale-out adapter would
 * want. Nothing uses it yet (v1 is single-process by design); it exists so
 * that change does not require restructuring this module.
 */
export async function duplicateClient(): Promise<typeof redis> {
  const copy = redis.duplicate();
  copy.on("error", (err) => {
    console.error("[skrivle] Redis (duplicate) error:", err instanceof Error ? err.message : err);
  });
  await copy.connect();
  return copy;
}

/** Whether Redis is answering right now. Drives /healthz. */
export async function redisHealthy(): Promise<boolean> {
  try {
    return redis.isReady && (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}

/** Close cleanly on shutdown. Never throws — shutdown must not be blocked. */
export async function disconnectRedis(): Promise<void> {
  if (!redis.isOpen) return;
  try {
    await redis.quit();
  } catch {
    redis.destroy();
  }
}
