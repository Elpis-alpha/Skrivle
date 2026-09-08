// Entrypoint. Boots the Skrivle API + realtime gateway.
import { config, featureEnabled } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { startExpirySweep, stopExpirySweep } from "./jobs/expiry-sweep.js";
import { installSignalHandlers, onShutdown, shutdown } from "./lifecycle.js";
import { verifyMailTransport } from "./mail/transport.js";
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

  // Non-blocking: a mail outage must not stop the API from serving. If the
  // credentials are present but unusable, say so loudly and carry on.
  if (featureEnabled.mail) {
    void verifyMailTransport().then((ok) => {
      if (!ok) {
        console.warn("[skrivle] mail credentials present but unusable — sign-in email will fail");
      }
    });
  }
});

httpServer.on("error", (err) => {
  console.error("[skrivle] server failed to start:", err.message);
  void shutdown("listen-error");
});
