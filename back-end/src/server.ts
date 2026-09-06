// Assembles the HTTP + realtime server. docs/ARCHITECTURE.md#high-level-shape:
// one Express process exposing /api (REST) and /socket.io (Socket.IO), with
// Nginx terminating TLS in front of it in production.
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import type { Server as IOServer } from "socket.io";
import { config } from "./config/env.js";
import { errorHandler } from "./http/middleware/error-handler.js";
import { notFound } from "./http/middleware/not-found.js";
import { apiRouter } from "./http/router.js";
import { attachGateway } from "./realtime/gateway.js";

export type AppServer = {
  app: Express;
  httpServer: HttpServer;
  io: IOServer;
};

export function createServer(): AppServer {
  const app = express();

  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, service: "skrivle-api", env: config.nodeEnv });
  });

  app.use("/api", apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  const httpServer = createHttpServer(app);
  const io = attachGateway(httpServer);

  return { app, httpServer, io };
}
