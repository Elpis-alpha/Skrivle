// The transport core. Knows the wire protocol and nothing about Skrivle.

import { API_URL } from "./config";
import { ApiError } from "./errors";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

export type ApiRequest = {
  method?: Method;
  /** Sent as JSON. POST and PATCH default to `{}` — see the note below. */
  body?: unknown;
  signal?: AbortSignal;
};

const OFFLINE_MESSAGE = "Couldn't reach Skrivle's server.";
const OFFLINE_NEXT = "Check your connection and try again.";

/**
 * Reads the standard error envelope. A body that isn't JSON, or is JSON without
 * the envelope (a proxy's 502 page, an HTML error), still has to produce a
 * usable ApiError rather than an unhandled SyntaxError.
 */
async function errorFrom(response: Response): Promise<ApiError> {
  let message = "The server returned an unexpected response.";
  let next = "Retry in a moment.";

  try {
    const body: unknown = await response.json();
    const envelope = (body as { error?: { message?: unknown; next?: unknown } })
      ?.error;
    if (typeof envelope?.message === "string") message = envelope.message;
    if (typeof envelope?.next === "string") next = envelope.next;
  } catch {
    // Not JSON. Keep the fallback copy.
  }

  const retryAfter = Number(response.headers.get("Retry-After"));
  return new ApiError(
    response.status,
    message,
    next,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  );
}

/**
 * Every call to the Skrivle API goes through here.
 *
 * `credentials: "include"` is unconditional, not an option: the session is an
 * httpOnly cookie on another origin and there is no call that should skip it.
 * Both localhost:3000↔:4000 and skrivle.elpis.cc↔api.skrivle.elpis.cc are
 * same-site, so the SameSite=Lax cookie rides along without a proxy.
 *
 * @throws {ApiError} on any non-2xx, and with `status: 0` when the request
 * never reached the server (offline, DNS, CORS refusal). AbortError passes
 * through untouched so callers can ignore their own cancellations.
 */
export async function apiFetch<T>(
  path: string,
  init: ApiRequest = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const sendsBody = method === "POST" || method === "PATCH";

  // express.json() leaves req.body undefined when no body is sent, and every
  // zod schema on the server is a z.object that rejects undefined — so a
  // bodyless POST /api/boards 400s even though all its fields are optional.
  // Defaulting here means no caller can forget it.
  const headers: HeadersInit = sendsBody
    ? { "Content-Type": "application/json" }
    : {};

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      ...(sendsBody ? { body: JSON.stringify(init.body ?? {}) } : {}),
      ...(init.signal ? { signal: init.signal } : {}),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, OFFLINE_MESSAGE, OFFLINE_NEXT);
  }

  if (!response.ok) throw await errorFrom(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
