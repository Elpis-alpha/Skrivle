// Shared setup for tests that exercise real Redis.
//
// These run against a real server rather than a mock: the code under test leans
// on atomic INCR, hash fields, and TTL semantics, and a mock that reimplements
// those would mostly be testing the mock.
import { afterAll, beforeAll } from "vitest";
import { redis } from "../redis/client.js";

/** Connect before the suite and disconnect after. */
export function useRedis(): void {
  beforeAll(async () => {
    if (!redis.isOpen) await redis.connect();
  });

  afterAll(async () => {
    if (redis.isOpen) await redis.quit();
  });
}

/** Remove every key matching the given patterns. */
export async function flushTestKeys(...patterns: string[]): Promise<void> {
  for (const pattern of patterns) {
    const found = await redis.keys(pattern);
    if (found.length > 0) await redis.del(found);
  }
}
