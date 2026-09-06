import { describe, expect, it } from "vitest";
import { generateBoardId, isValidCustomId, mintUniqueBoardId } from "./board-id.js";

describe("generateBoardId", () => {
  it("returns five characters by default", () => {
    expect(generateBoardId()).toHaveLength(5);
  });

  it("honours a requested length", () => {
    expect(generateBoardId(12)).toHaveLength(12);
  });

  it("only uses the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateBoardId()).toMatch(/^[bcdfghjkmnpqrstvwxyz23456789]{5}$/);
    }
  });
});

describe("isValidCustomId", () => {
  it("accepts alphanumerics and hyphens, 3–32 chars", () => {
    expect(isValidCustomId("sprint-planning-q3")).toBe(true);
    expect(isValidCustomId("abc")).toBe(true);
    expect(isValidCustomId("a".repeat(32))).toBe(true);
  });

  it("rejects anything too short, too long, or carrying illegal characters", () => {
    expect(isValidCustomId("ab")).toBe(false);
    expect(isValidCustomId("a".repeat(33))).toBe(false);
    expect(isValidCustomId("has space")).toBe(false);
    expect(isValidCustomId("<script>")).toBe(false);
  });
});

describe("mintUniqueBoardId", () => {
  it("retries until the existence check clears", async () => {
    let calls = 0;
    const exists = async () => {
      calls += 1;
      return calls < 3;
    };
    const id = await mintUniqueBoardId(exists);
    expect(id).toHaveLength(5);
    expect(calls).toBe(3);
  });

  it("gives up after 10 collisions", async () => {
    await expect(mintUniqueBoardId(async () => true)).rejects.toThrow(
      /unique board id/,
    );
  });
});
