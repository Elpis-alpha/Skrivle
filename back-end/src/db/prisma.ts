// PrismaClient singleton. Schema: prisma/schema.prisma.
// Run `npm run prisma:generate` before building — the client is generated code.
import { PrismaClient } from "@prisma/client";
import { config } from "../config/env.js";

export const prisma = new PrismaClient({
  // Queries are noisy in normal dev work; warnings and errors are not.
  log: config.isProduction ? ["warn", "error"] : ["warn", "error"],
});

/** Whether Postgres is answering right now. Drives /healthz. */
export async function dbHealthy(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
