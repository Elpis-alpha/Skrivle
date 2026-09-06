// Standard body for a scaffolded-but-unbuilt endpoint.
// Tone follows STYLE_GUIDE.md §10.3: say what happened and the next step.
import type { Response } from "express";

export function notImplemented(res: Response, what: string): void {
  res.status(501).json({
    error: {
      message: `${what} isn't wired up yet.`,
      next: "This endpoint is a Phase 1 stub — see back-end/README.md and docs/ROADMAP.md.",
    },
  });
}
