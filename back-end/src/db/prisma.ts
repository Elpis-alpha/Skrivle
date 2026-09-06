// PrismaClient singleton. Schema: prisma/schema.prisma.
// Run `npm run prisma:generate` before building — the client is generated code.
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
