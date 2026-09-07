import { describe, expect, it } from "vitest";
import { parseBoardRef } from "./board-id";

describe("parseBoardRef", () => {
  it("accepts a bare id", () => {
    expect(parseBoardRef("k3m9p")).toEqual({ ok: true, id: "k3m9p" });
  });

  it("trims surrounding whitespace", () => {
    expect(parseBoardRef("  k3m9p \n")).toEqual({ ok: true, id: "k3m9p" });
  });

  it("accepts a custom id with hyphens", () => {
    expect(parseBoardRef("sprint-planning-q3")).toEqual({
      ok: true,
      id: "sprint-planning-q3",
    });
  });

  it("pulls the id out of a full pasted URL", () => {
    expect(parseBoardRef("https://skrivle.elpis.cc/board/k3m9p")).toEqual({
      ok: true,
      id: "k3m9p",
    });
  });

  it("pulls the id out of a URL with no protocol", () => {
    expect(parseBoardRef("skrivle.elpis.cc/board/k3m9p")).toEqual({
      ok: true,
      id: "k3m9p",
    });
  });

  it("pulls the id out of a bare path", () => {
    expect(parseBoardRef("/board/k3m9p")).toEqual({ ok: true, id: "k3m9p" });
  });

  it("ignores a query string and hash", () => {
    expect(parseBoardRef("https://skrivle.elpis.cc/board/k3m9p?ref=x#top")).toEqual({
      ok: true,
      id: "k3m9p",
    });
  });

  it("rejects an empty field and says what to do", () => {
    expect(parseBoardRef("   ")).toEqual({
      ok: false,
      error: "Enter a board link or id.",
    });
  });

  it("rejects a URL that has no board id in it", () => {
    const result = parseBoardRef("https://skrivle.elpis.cc/about");
    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("error", "That link has no board id in it.");
  });

  it("rejects an id that is too short", () => {
    const result = parseBoardRef("ab");
    expect(result.ok).toBe(false);
    expect(result).toHaveProperty(
      "error",
      "Board ids are 3–32 letters, numbers, or hyphens.",
    );
  });

  it("rejects an id carrying illegal characters", () => {
    expect(parseBoardRef("k3m 9p").ok).toBe(false);
    expect(parseBoardRef("k3m/9p/extra").ok).toBe(false);
    expect(parseBoardRef("<script>").ok).toBe(false);
  });

  it("rejects an id that is too long", () => {
    expect(parseBoardRef("a".repeat(33)).ok).toBe(false);
    expect(parseBoardRef("a".repeat(32)).ok).toBe(true);
  });
});
