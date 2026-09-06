// Board REST — docs/ARCHITECTURE.md#board-identity + #ephemeral-boards--expiry.
// Stub handlers: no persistence yet. Board-id helpers live in src/boards/board-id.ts.
import { Router } from "express";
import { notImplemented } from "../not-implemented.js";

export const boardsRouter = Router();

// Create a board — server mints the id (collision-checked) and returns
// { id, creatorToken }. Replaces the front-end's client-side generateBoardId.
boardsRouter.post("/", (_req, res) => notImplemented(res, "Creating a board"));

// "My Boards" for the signed-in user (title, updatedAt, role, thumbnail).
boardsRouter.get("/", (_req, res) => notImplemented(res, "Listing boards"));

// Board metadata / existence — drives the "not found" and "expired" states.
boardsRouter.get("/:id", (_req, res) => notImplemented(res, "Looking up a board"));

// Is a custom id still free? (custom-id field, checked on blur.)
boardsRouter.get("/:id/available", (_req, res) =>
  notImplemented(res, "The id availability check"),
);

// Extend a guest board by +48h using the creator token.
boardsRouter.post("/:id/extend", (_req, res) =>
  notImplemented(res, "Extending a board"),
);

// Claim a guest board after signing in (set owner, add collaborator row).
boardsRouter.post("/:id/claim", (_req, res) =>
  notImplemented(res, "Claiming a board"),
);
