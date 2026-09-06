import type { RequestHandler } from "express";

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      message: `No route matches ${req.method} ${req.originalUrl}.`,
      next: "Check the path against back-end/README.md.",
    },
  });
};
