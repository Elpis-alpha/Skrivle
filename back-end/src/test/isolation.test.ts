import { describe, expect, it } from "vitest";
import { prisma } from "../db/prisma.js";

// A guard, not a feature test: several suites truncate tables, so if this ever
// points at the development database it destroys real work.
describe("test isolation", () => {
  it("connects to the test database, never the development one", async () => {
    const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() as db`;
    expect(row.db).toContain("skrivle_test");
    await prisma.$disconnect();
  });
});
