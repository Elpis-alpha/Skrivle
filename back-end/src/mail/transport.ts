// Outbound mail: the Gmail HTTPS API (port 443), not SMTP.
//
// This was nodemailer's Gmail SMTP transport until it became clear it could not
// survive the deploy. VPS hosts routinely block outbound SMTP (ports 25/465/587)
// as anti-spam policy, and a blocked port makes an SMTP send hang until the
// socket times out — with this send sitting inline in the
// POST /api/auth/email/request handler. The Gmail REST API runs over 443, the
// same as the Postgres and Cloudinary traffic that already works from the box.
//
// nodemailer stays, but only to compose the MIME message; no socket is opened.
// The access token is minted from the stored refresh token exactly the way
// src/auth/oauth/flow.ts exchanges an authorization code — same endpoint, same
// checks — so no Google SDK is pulled in.
//
// Two operational limits are unchanged, both inherited from using a Gmail
// account rather than a transactional provider:
//   1. While the mail project's OAuth consent screen is in "Testing", the
//      refresh token expires after 7 days. It must be moved to "In production".
//   2. Gmail caps sending at ~500/day, and mail from a gmail.com address to
//      strangers often lands in Promotions or spam.
import nodemailer from "nodemailer";
import { config, devSignInCodes, featureEnabled } from "../config/env.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

// Composes a message to a Buffer instead of sending it anywhere.
const mimeBuilder = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
  newline: "unix",
});

/** Cached Gmail access token, reused until just before it expires. */
let token: { value: string; expiresAt: number } | null = null;

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Mint (or reuse) a Gmail access token from the stored refresh token. Mirrors
 * exchangeCode() in src/auth/oauth/flow.ts: same token endpoint, same trio of
 * failure checks (HTTP status, an `error` field, a missing token).
 */
async function accessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt - 60_000) return token.value;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.mail.clientId,
      client_secret: config.mail.clientSecret,
      refresh_token: config.mail.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) throw new Error(`Gmail token refresh returned ${res.status}`);

  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (body.error) {
    throw new Error(`Gmail token refresh failed: ${body.error_description ?? body.error}`);
  }
  if (!body.access_token) throw new Error("Gmail token refresh returned no access_token");

  token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return token.value;
}

/** POST a base64url MIME message to Gmail, refreshing the token once on a 401. */
async function gmailSend(raw: string): Promise<void> {
  const attempt = async (): Promise<Response> =>
    fetch(SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

  let res = await attempt();
  if (res.status === 401) {
    // Token revoked before its nominal expiry — drop it and try once more.
    token = null;
    res = await attempt();
  }
  if (!res.ok) {
    throw new Error(`Gmail send returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * Send a message. Resolves false when mail is not configured or the send fails.
 *
 * Callers must not surface the difference to the user: whether an address
 * exists, and whether mail actually went out, are both things an attacker would
 * like to learn from a sign-in form.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  // Under AUTH_DEV_CODES the code travels in the response instead, so nothing
  // should go out even if real credentials happen to be in the environment.
  if (devSignInCodes) return false;

  if (!featureEnabled.mail) {
    // Without this, local development needs live Google credentials just to
    // exercise the sign-in flow.
    console.warn(`[skrivle] mail not configured — would have sent "${mail.subject}" to ${mail.to}`);
    if (!config.isProduction) console.warn(`[skrivle] message body:\n${mail.text}`);
    return false;
  }

  try {
    const built = await mimeBuilder.sendMail({
      from: `Skrivle <${config.mail.address}>`,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    // `buffer: true` guarantees `message` is a Buffer at runtime.
    await gmailSend(toBase64Url(built.message as Buffer));
    return true;
  } catch (err) {
    console.error("[skrivle] mail send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Verify the credentials actually work — minting an access token is the
 * HTTPS-API equivalent of the old SMTP verify(). Used by the startup probe in
 * src/index.ts and by tooling, not the request path.
 */
export async function verifyMailTransport(): Promise<boolean> {
  if (!featureEnabled.mail) return false;
  try {
    await accessToken();
    return true;
  } catch (err) {
    console.error("[skrivle] mail transport unusable:", err instanceof Error ? err.message : err);
    return false;
  }
}
