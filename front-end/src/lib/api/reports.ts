// Error reports. back-end/src/http/routes/errors.ts

import { apiFetch } from "./fetch";
import type { ErrorReport } from "./types";

/** Lands in the API's log as one line. Answers 204, or 429 past the per-address limit. */
export function sendErrorReport(report: ErrorReport): Promise<void> {
  return apiFetch<void>("/api/errors", { method: "POST", body: report });
}
