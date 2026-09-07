// Auth — docs/ARCHITECTURE.md#auth--ownership. An emailed one-time code, or
// OAuth (GitHub + Google). No passwords anywhere.
import { Router } from "express";
import { z } from "zod";
import { publicUser, resolveUser, UnverifiedEmailCollision } from "../../auth/identity.js";
import { optionalSession, requireSession } from "../../auth/middleware.js";
import { CODE_LENGTH, inCooldown, issueCode, normalizeEmail, verifyCode } from "../../auth/otp.js";
import {
  beginAuthorization,
  consumeState,
  exchangeCode,
  frontendRedirect,
  safeReturnTo,
} from "../../auth/oauth/flow.js";
import { isProviderName, NoVerifiedEmail, PROVIDERS } from "../../auth/oauth/providers.js";
import {
  clearSessionCookie,
  createSession,
  destroyAllSessions,
  destroySession,
  sessionIdFrom,
  setSessionCookie,
} from "../../auth/session.js";
import { config, devSignInCodes, featureEnabled } from "../../config/env.js";
import { signInCodeEmail } from "../../mail/templates.js";
import { sendMail } from "../../mail/transport.js";
import { consume, limitByIp, RULES, tooMany } from "../../redis/rate-limit.js";
import { hashToken } from "../../auth/hash.js";
import { validate } from "../middleware/validate.js";
import { TTL } from "../../redis/keys.js";

export const authRouter = Router();

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

const verifySchema = emailSchema.extend({
  code: z.string().regex(new RegExp(`^\\d{${CODE_LENGTH}}$`), `must be ${CODE_LENGTH} digits`),
});

// --- Email one-time code -----------------------------------------------------

authRouter.post(
  "/email/request",
  limitByIp(RULES.otpRequestPerIp),
  validate(emailSchema),
  async (req, res) => {
    const { email } = req.body as z.infer<typeof emailSchema>;

    // Per-address limit on top of the per-IP one, so a botnet cannot use many
    // addresses from many IPs to mailbomb one person.
    const perEmail = await consume(RULES.otpRequestPerEmail, hashToken(email));
    if (!perEmail.allowed) {
      tooMany(res, perEmail);
      return;
    }

    // Everything below responds identically whether or not the address has an
    // account, whether or not mail actually sent, and whether or not a resend
    // was suppressed. A sign-in form must not be an oracle for which addresses
    // are registered.
    const ok = { ok: true, expiresInSeconds: TTL.otp };

    if (await inCooldown(email)) {
      res.json(ok);
      return;
    }

    const code = await issueCode(email);
    await sendMail(signInCodeEmail(email, code));
    // Development only, and only on the path that actually issued a code — the
    // cooldown branch above still answers with a bare `ok`, which is correct:
    // no code was minted, so there is none to hand back.
    res.json(devSignInCodes ? { ...ok, code } : ok);
  },
);

authRouter.post(
  "/email/verify",
  limitByIp(RULES.otpVerifyPerIp),
  validate(verifySchema),
  async (req, res) => {
    const { email, code } = req.body as z.infer<typeof verifySchema>;

    const result = await verifyCode(email, code);
    if (!result.ok) {
      res.status(400).json({ error: codeError(result.reason) });
      return;
    }

    // An email code proves control of the inbox, which is exactly what
    // "verified" means here.
    const user = await resolveUser({
      provider: "email",
      providerAccountId: normalizeEmail(email),
      email,
      emailVerified: true,
      name: email.split("@")[0],
    });

    const sessionId = await createSession(user.id, req.get("user-agent"));
    setSessionCookie(res, sessionId);
    res.json({ user: publicUser(user) });
  },
);

function codeError(reason: "expired" | "mismatch" | "exhausted") {
  switch (reason) {
    case "expired":
      return {
        message: "That code has expired or was already used.",
        next: "Request a new code and enter it within 10 minutes.",
      };
    case "exhausted":
      return {
        message: "That code has been entered incorrectly too many times and is no longer valid.",
        next: "Request a new code to try again.",
      };
    case "mismatch":
      return {
        message: "That code doesn't match the one sent to this address.",
        next: "Check the most recent email and re-enter the code.",
      };
  }
}

// --- OAuth -------------------------------------------------------------------

const authorizeQuery = z.object({
  returnTo: z.string().optional(),
  claim: z.string().optional(),
});

for (const provider of ["github", "google"] as const) {
  authRouter.get(`/${provider}`, validate(authorizeQuery, "query"), async (req, res) => {
    if (!featureEnabled[provider]) {
      res.status(503).json({
        error: {
          message: `${titleCase(provider)} sign-in isn't configured on this server.`,
          next: "Use an emailed sign-in code instead, or set the provider credentials.",
        },
      });
      return;
    }

    const { returnTo, claim } = req.query as z.infer<typeof authorizeQuery>;
    const url = await beginAuthorization({
      provider,
      returnTo,
      ...(claim ? { claimBoardId: claim } : {}),
    });
    res.redirect(url);
  });
}

authRouter.get("/callback/:provider", async (req, res) => {
  const name = req.params.provider;
  if (!isProviderName(name)) {
    res.redirect(errorRedirect("/", "unsupported_provider"));
    return;
  }

  const state = await consumeState(typeof req.query.state === "string" ? req.query.state : undefined);
  // No state means a replayed, forged, or expired callback. There is no safe
  // returnTo to honour in that case, so it goes to the sign-in page.
  if (!state || state.provider !== name) {
    res.redirect(errorRedirect("/signin", "invalid_state"));
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  if (!code) {
    // The user pressed "Cancel" at the provider, or the provider errored.
    res.redirect(errorRedirect(state.returnTo, "cancelled"));
    return;
  }

  try {
    const provider = PROVIDERS[name];
    const tokens = await exchangeCode(provider, code, state.verifier);
    const profile = await provider.fetchProfile(tokens);
    const user = await resolveUser(profile);

    const sessionId = await createSession(user.id, req.get("user-agent"));
    setSessionCookie(res, sessionId);

    // Claiming is wired up with the boards service in the next phase; the id is
    // carried through state so the redirect can act on it there.
    const destination = state.claimBoardId
      ? `${state.returnTo}${state.returnTo.includes("?") ? "&" : "?"}claim=${encodeURIComponent(state.claimBoardId)}`
      : state.returnTo;

    res.redirect(frontendRedirect(destination));
  } catch (err) {
    res.redirect(errorRedirect(state.returnTo, oauthErrorCode(err)));
  }
});

/** Map a failure to a short code the front-end can turn into copy. */
function oauthErrorCode(err: unknown): string {
  if (err instanceof NoVerifiedEmail) return "no_verified_email";
  if (err instanceof UnverifiedEmailCollision) return "email_in_use";
  console.error("[skrivle] OAuth callback failed:", err);
  return "signin_failed";
}

function errorRedirect(returnTo: string, code: string): string {
  const path = safeReturnTo(returnTo);
  const separator = path.includes("?") ? "&" : "?";
  return `${config.frontendUrl}${path}${separator}error=${code}`;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// --- Session -----------------------------------------------------------------

authRouter.get("/me", optionalSession, (req, res) => {
  res.json({
    user: req.user ? publicUser(req.user) : null,
    // Lets the sign-in page hide buttons that cannot work on this deployment.
    methods: {
      email: featureEnabled.mail,
      github: featureEnabled.github,
      google: featureEnabled.google,
    },
  });
});

authRouter.post("/logout", async (req, res) => {
  await destroySession(sessionIdFrom(req));
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.post("/logout/all", requireSession, async (req, res) => {
  await destroyAllSessions(req.user!.id);
  clearSessionCookie(res);
  res.status(204).end();
});
