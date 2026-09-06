// Auth — docs/ARCHITECTURE.md#auth--ownership. An emailed one-time code, or
// OAuth (GitHub + Google). No passwords. All handlers are stubs; the email
// sender, OAuth library, and session mechanism are Phase 1 decisions
// (see back-end/README.md).
import { Router } from "express";
import { notImplemented } from "../not-implemented.js";

export const authRouter = Router();

// Email one-time code: request a code, then verify it. Codes live in the
// login_codes table (hashed, short-lived) — see prisma/schema.prisma.
authRouter.post("/email/request", (_req, res) =>
  notImplemented(res, "Emailing a sign-in code"),
);
authRouter.post("/email/verify", (_req, res) =>
  notImplemented(res, "Verifying a sign-in code"),
);

// OAuth redirect dance.
authRouter.get("/github", (_req, res) => notImplemented(res, "GitHub sign-in"));
authRouter.get("/google", (_req, res) => notImplemented(res, "Google sign-in"));

// Provider redirect target.
authRouter.get("/callback/:provider", (_req, res) =>
  notImplemented(res, "The OAuth callback"),
);

// Current session and sign-out.
authRouter.get("/me", (_req, res) => notImplemented(res, "The session lookup"));
authRouter.post("/logout", (_req, res) => notImplemented(res, "Sign-out"));
