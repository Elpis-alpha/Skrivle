// Where an unexpected error ends up, whichever tier it happened in.
//
// There is no error service behind this: the API's own log is the report, and
// the browser posts its errors here (POST /api/errors) to join it. Each one is a
// single line of JSON behind a fixed tag, so a stack trace can't sprawl across
// the log, a report can't forge a line with an embedded newline, and one grep
// finds every error from both tiers:
//
//   docker compose logs back-end | grep '\[skrivle\] error '
//
// For failures this process expected and handled — a mail send refused, Redis
// dropping — the plain console lines stay. This is for the ones nobody planned.

const TAG = "[skrivle] error";

/** What the browser sends. Mirrors the ErrorReport schema in openapi.yaml. */
export type BrowserErrorReport = {
  /** What caught it: a React error boundary, `window.onerror`, or an unhandled rejection. */
  source: "boundary" | "window" | "promise";
  message: string;
  stack?: string;
  /** Next.js's hash of an error that happened while rendering on the server. */
  digest?: string;
  /** The page's path, without its query or fragment. */
  path: string;
};

/** Report an error this process didn't expect. `where` names the subsystem. */
export function reportError(where: string, err: unknown, context: Record<string, unknown> = {}): void {
  const error = err instanceof Error ? err : null;
  write({
    tier: "api",
    where,
    message: error ? error.message : String(err),
    ...(error?.stack ? { stack: error.stack } : {}),
    ...context,
  });
}

/** Report an error a browser sent in. */
export function reportBrowserError(report: BrowserErrorReport, userAgent: string | undefined): void {
  write({ tier: "browser", ...report, ...(userAgent ? { userAgent } : {}) });
}

function write(entry: Record<string, unknown>): void {
  console.error(`${TAG} ${JSON.stringify(entry)}`);
}
