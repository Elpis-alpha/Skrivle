// STYLE_GUIDE.md §10.3 — say what happened and the next step; never apologise.
import type { ErrorRequestHandler } from "express";
import { reportError } from "../../errors/report.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  reportError("http", err, { method: req.method, path: req.path });
  res.status(500).json({
    error: {
      message: "The server hit an unexpected error handling that request.",
      next: "Retry in a moment; if it persists, check the server logs.",
    },
  });
};
