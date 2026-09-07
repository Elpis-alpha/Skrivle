import { describe, expect, it } from "vitest";
import { OAUTH_ERRORS, oauthError } from "./landing";

// Every code back-end/src/http/routes/auth.ts can redirect with.
const DOCUMENTED = [
  "unsupported_provider",
  "invalid_state",
  "cancelled",
  "no_verified_email",
  "email_in_use",
  "signin_failed",
];

describe("oauthError", () => {
  it("covers every documented callback error code", () => {
    for (const code of DOCUMENTED) {
      expect(OAUTH_ERRORS[code], code).toBeDefined();
    }
  });

  it("gives every code both a message and a next step", () => {
    for (const [code, copy] of Object.entries(OAUTH_ERRORS)) {
      expect(copy.message.length, code).toBeGreaterThan(0);
      expect(copy.next.length, code).toBeGreaterThan(0);
    }
  });

  it("falls back to the generic failure for an unknown code", () => {
    expect(oauthError("something_new")).toEqual(OAUTH_ERRORS.signin_failed);
  });

  it("returns null when there is no error param", () => {
    expect(oauthError(null)).toBeNull();
    expect(oauthError(undefined)).toBeNull();
    expect(oauthError("")).toBeNull();
  });
});
