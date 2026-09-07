// Entrypoint. Boots the Skrivle API + realtime gateway.
import { config } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { startExpirySweep, stopExpirySweep } from "./jobs/expiry-sweep.js";
import { installSignalHandlers, onShutdown, shutdown } from "./lifecycle.js";
import { startSnapshotWriter, stopSnapshotWriter } from "./realtime/snapshot-writer.js";
import { connectRedis, disconnectRedis } from "./redis/client.js";
import { createServer } from "./server.js";

installSignalHandlers();
connectRedis();

const { httpServer, io } = createServer();

startSnapshotWriter();
startExpirySweep();

// Order matters. Sockets close first so no new edits arrive, then the writer
// flushes every dirty board to Postgres, and only then do the connections it
// needs get torn down.
onShutdown("stop expiry sweep", () => stopExpirySweep());
onShutdown("close sockets", () => io.close());
onShutdown("flush boards", () => stopSnapshotWriter());
onShutdown("close http", () => new Promise<void>((resolve) => httpServer.close(() => resolve())));
onShutdown("disconnect redis", () => disconnectRedis());
onShutdown("disconnect postgres", () => prisma.$disconnect());

httpServer.listen(config.port, () => {
  console.log(
    `[skrivle] API on http://localhost:${config.port}  ·  env ${config.nodeEnv}`,
  );
  console.log("[skrivle] Socket.IO gateway mounted at /socket.io");
});

httpServer.on("error", (err) => {
  console.error("[skrivle] server failed to start:", err.message);
  void shutdown("listen-error");
});
