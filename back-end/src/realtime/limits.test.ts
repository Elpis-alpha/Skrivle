import { describe, expect, it } from "vitest";
import { newBucket, take, type BucketRule } from "./limits.js";

const rule: BucketRule = { capacity: 3, perSecond: 2 };

describe("take", () => {
  it("allows a burst up to the capacity, then refuses", () => {
    const bucket = newBucket(rule, 0);

    expect([take(bucket, rule, 0), take(bucket, rule, 0), take(bucket, rule, 0)]).toEqual([
      true,
      true,
      true,
    ]);
    expect(take(bucket, rule, 0)).toBe(false);
  });

  it("refills at the rule's rate", () => {
    const bucket = newBucket(rule, 0);
    for (let i = 0; i < 3; i++) take(bucket, rule, 0);

    // Half a second at two a second is one token: one more, and no more.
    expect(take(bucket, rule, 500)).toBe(true);
    expect(take(bucket, rule, 500)).toBe(false);
  });

  it("never holds more than the capacity, however long it sat idle", () => {
    const bucket = newBucket(rule, 0);

    let allowed = 0;
    for (let i = 0; i < 10; i++) if (take(bucket, rule, 60_000)) allowed++;

    expect(allowed).toBe(3);
  });

  it("is not thrown by a clock that steps backwards", () => {
    const bucket = newBucket(rule, 1000);
    for (let i = 0; i < 3; i++) take(bucket, rule, 1000);

    expect(take(bucket, rule, 0)).toBe(false);
    expect(take(bucket, rule, 500)).toBe(true);
  });
});
