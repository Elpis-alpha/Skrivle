// Entrypoint. Boots the Skrivle API + realtime gateway.
import { config } from "./config/env.js";
import { startSnapshotWriter } from "./realtime/snapshot-writer.js";
import { createServer } from "./server.js";

const { httpServer } = createServer();

startSnapshotWriter();

httpServer.listen(config.port, () => {
  console.log(
    `[skrivle] API on http://localhost:${config.port}  ·  env ${config.nodeEnv}`,
  );
  console.log("[skrivle] Socket.IO gateway mounted at /socket.io");
});
