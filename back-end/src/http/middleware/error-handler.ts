// STYLE_GUIDE.md §10.3 — say what happened and the next step; never apologise.
import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("[skrivle] unhandled error:", err);
  res.status(500).json({
    error: {
      message: "The server hit an unexpected error handling that request.",
      next: "Retry in a moment; if it persists, check the server logs.",
    },
  });
};
