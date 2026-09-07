// Every REST error the back-end returns uses one envelope:
//
//   { error: { message, next } }
//
// `message` says what happened, `next` says what to do about it
// (STYLE_GUIDE.md §10.3 — name the fix, never apologise). There is no
// machine-readable code field anywhere in the API, so one error class carrying
// the status is the whole contract; callers discriminate on `status`.

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the request never reached the server. */
    readonly status: number,
    message: string,
    /** The envelope's `next`. Always shown alongside `message`. */
    readonly next: string,
    /** From the Retry-After header on a 429. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** True when the request never left the building — offline, DNS, CORS refusal. */
export function isOffline(error: unknown): boolean {
  return isApiError(error) && error.status === 0;
}
