// Errors the browser ran into, posted here so they land in the same log as the
// API's own (src/errors/report.ts). No session needed: a guest's board breaks
// the same way a signed-in user's does.
import { Router } from "express";
import { z } from "zod";
import { reportBrowserError } from "../../errors/report.js";
import { limitByIp, RULES } from "../../redis/rate-limit.js";
import { validate } from "../middleware/validate.js";

export const errorsRouter = Router();

// Caps well past any real error, so a report is refused rather than cut short;
// the browser trims its own before sending.
const reportSchema = z.object({
  source: z.enum(["boundary", "window", "promise"]),
  message: z.string().min(1).max(1000),
  stack: z.string().max(8000).optional(),
  digest: z.string().max(200).optional(),
  path: z.string().max(500),
});

errorsRouter.post("/", limitByIp(RULES.errorReportPerIp), validate(reportSchema), (req, res) => {
  reportBrowserError(req.body as z.infer<typeof reportSchema>, req.get("user-agent")?.slice(0, 300));
  res.status(204).end();
});
