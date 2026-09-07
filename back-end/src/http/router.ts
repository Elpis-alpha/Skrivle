// Mounts everything under /api. See src/server.ts.
import { Router } from "express";
import { authRouter } from "./routes/auth.js";
import { boardsRouter } from "./routes/boards.js";
import { meRouter } from "./routes/me.js";
import { uploadsRouter } from "./routes/uploads.js";

export const apiRouter = Router();

apiRouter.use("/boards", boardsRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/uploads", uploadsRouter);
apiRouter.use("/me", meRouter);
