// Sends the errors this page runs into to the API's log (POST /api/errors).
//
// A browser's console belongs to whoever is looking at the page, so an error
// nobody reports is an error nobody hears about. Everything here is best
// effort: reporting must never be the thing that throws.

import { sendErrorReport } from "@/lib/api/reports";
import type { ErrorReport } from "@/lib/api/types";

// The API's limits. It refuses a longer report rather than trimming it.
const MAX_MESSAGE = 1000;
const MAX_STACK = 8000;
const MAX_DIGEST = 200;
const MAX_PATH = 500;

/** A render loop throws the same thing for as long as it runs; one page sends this many at most. */
const MAX_PER_PAGE = 10;

/** What this page has already sent, by message and stack. */
const sent = new Set<string>();

/** Report an error, once per page. Never throws. */
export function reportError(error: unknown, source: ErrorReport["source"]): void {
  const report = toReport(error, source);
  if (!worthSending(report)) return;

  const key = `${report.message}\n${report.stack ?? ""}`;
  if (sent.has(key) || sent.size >= MAX_PER_PAGE) return;
  sent.add(key);

  sendErrorReport(report).catch(() => {
    // Offline, or over the limit. There's nowhere left to report it.
  });
}

function toReport(error: unknown, source: ErrorReport["source"]): ErrorReport {
  const err = error instanceof Error ? error : null;
  const message = !err
    ? String(error)
    : err.name === "Error"
      ? err.message || err.name
      : `${err.name}: ${err.message}`;
  const digest = err && "digest" in err && typeof err.digest === "string" ? err.digest : null;

  return {
    source,
    message: message.slice(0, MAX_MESSAGE),
    ...(err?.stack ? { stack: err.stack.slice(0, MAX_STACK) } : {}),
    ...(digest ? { digest: digest.slice(0, MAX_DIGEST) } : {}),
    // The path alone: a query can carry a sign-in code or a claim token.
    path: window.location.pathname.slice(0, MAX_PATH),
  };
}

/**
 * "Script error." is all a browser will say about a script from another origin,
 * and a visitor's extensions throw into the page too. Neither is ours to fix.
 */
function worthSending(report: ErrorReport): boolean {
  if (report.message === "Script error.") return false;
  if (report.stack && /\b(chrome|moz|safari-web)-extension:\/\//.test(report.stack)) return false;
  return report.message.length > 0;
}
