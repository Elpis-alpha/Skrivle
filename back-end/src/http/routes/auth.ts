// Auth — docs/ARCHITECTURE.md#auth--ownership. OAuth only (GitHub + Google),
// no passwords. All handlers are stubs; the OAuth library and session
// mechanism are a Phase 1 decision (see back-end/README.md).
import { Router } from "express";
import { notImplemented } from "../not-implemented.js";

export const authRouter = Router();

// Begin the OAuth redirect dance.
authRouter.get("/github", (_req, res) => notImplemented(res, "GitHub sign-in"));
authRouter.get("/google", (_req, res) => notImplemented(res, "Google sign-in"));

// Provider redirect target.
authRouter.get("/callback/:provider", (_req, res) =>
  notImplemented(res, "The OAuth callback"),
);

// Current session and sign-out.
authRouter.get("/me", (_req, res) => notImplemented(res, "The session lookup"));
authRouter.post("/logout", (_req, res) => notImplemented(res, "Sign-out"));
