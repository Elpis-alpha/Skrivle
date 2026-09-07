import { describe, expect, it } from "vitest";
import {
  generateBoardId,
  ID_ALPHABET,
  isValidCustomId,
  mintUniqueBoardId,
  normalizeBoardId,
} from "./board-id.js";

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

describe("normalizeBoardId", () => {
  it("lowercases and trims", () => {
    expect(normalizeBoardId("  Sprint-Planning  ")).toBe("sprint-planning");
  });

  it("makes a link that got title-cased still resolve", () => {
    expect(normalizeBoardId("K3M9P")).toBe(normalizeBoardId("k3m9p"));
  });
});

describe("generateBoardId distribution", () => {
  it("uses every character of the alphabet about equally often", () => {
    // Guards the rejection sampling in generateBoardId. The naive `byte % 28`
    // makes the first four letters exactly 9.4% likelier than the rest, so the
    // bounds here have to be tighter than that to be worth anything.
    //
    // 200k samples put the standard error near 1.2% of the expected count, so
    // a 6% band is ~5 sigma for correct output (no flaking) while still sitting
    // well inside the 9.4% skew a biased implementation produces.
    const counts = new Map<string, number>();
    const perDraw = 40;
    const draws = 5_000;
    for (let i = 0; i < draws; i++) {
      for (const char of generateBoardId(perDraw)) {
        counts.set(char, (counts.get(char) ?? 0) + 1);
      }
    }

    expect(counts.size).toBe(ID_ALPHABET.length);
    const expected = (draws * perDraw) / ID_ALPHABET.length;
    for (const [char, count] of counts) {
      expect(count / expected, `char ${char}`).toBeGreaterThan(0.94);
      expect(count / expected, `char ${char}`).toBeLessThan(1.06);
    }
  });
});
