// Assembles the HTTP + realtime server. docs/ARCHITECTURE.md#high-level-shape:
// one Express process exposing /api (REST) and /socket.io (Socket.IO), with
// Nginx terminating TLS in front of it in production.
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import type { Server as IOServer } from "socket.io";
import { config } from "./config/env.js";
import { dbHealthy } from "./db/prisma.js";
import { errorHandler } from "./http/middleware/error-handler.js";
import { notFound } from "./http/middleware/not-found.js";
import { mountDocs } from "./http/openapi.js";
import { apiRouter } from "./http/router.js";
import { attachGateway } from "./realtime/gateway.js";
import { redisHealthy } from "./redis/client.js";

export type AppServer = {
  app: Express;
  httpServer: HttpServer;
  io: IOServer;
};

export function createServer(): AppServer {
  const app = express();

  // In production Nginx is the only thing in front of this process, so exactly
  // one proxy hop is trustworthy. Without this, req.ip is Nginx's address and
  // every rate limit collapses into one shared bucket; with a looser setting a
  // caller could spoof X-Forwarded-For and evade limits entirely.
  if (config.isProduction) app.set("trust proxy", 1);

  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(cookieParser());
  // A board's canvas never travels over REST — it goes through Socket.IO — so
  // no endpoint here has a legitimate reason to accept a large body.
  app.use(express.json({ limit: "100kb" }));

  app.get("/healthz", async (_req, res) => {
    const [db, redis] = await Promise.all([dbHealthy(), redisHealthy()]);
    // Both are load-bearing: Postgres holds boards, Redis holds every session
    // and sign-in code. Degraded in either one means sign-in is broken.
    const ok = db && redis;
    res.status(ok ? 200 : 503).json({
      ok,
      service: "skrivle-api",
      env: config.nodeEnv,
      db: db ? "up" : "down",
      redis: redis ? "up" : "down",
    });
  });

  // Public API reference — /docs (Scalar) + /api/openapi.json.
  mountDocs(app);

  app.use("/api", apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  const httpServer = createHttpServer(app);
  const io = attachGateway(httpServer);

  return { app, httpServer, io };
}
