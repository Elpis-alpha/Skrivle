// Outbound mail: nodemailer over Gmail with OAuth2.
//
// Two operational limits worth knowing, both inherited from using a Gmail
// account rather than a transactional provider:
//   1. While the mail project's OAuth consent screen is in "Testing", the
//      refresh token expires after 7 days. It must be moved to "In production".
//   2. Gmail caps sending at ~500/day, and mail from a gmail.com address to
//      strangers often lands in Promotions or spam.
// Both are fine for a demo and are the reason config is swappable here.
import nodemailer, { type Transporter } from "nodemailer";
import { config, featureEnabled } from "../config/env.js";

let transporter: Transporter | null = null;

function getTransport(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: config.mail.address,
      clientId: config.mail.clientId,
      clientSecret: config.mail.clientSecret,
      refreshToken: config.mail.refreshToken,
    },
  });
  return transporter;
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
  if (!featureEnabled.mail) {
    // Without this, local development needs live Google credentials just to
    // exercise the sign-in flow.
    console.warn(`[skrivle] mail not configured — would have sent "${mail.subject}" to ${mail.to}`);
    if (!config.isProduction) console.warn(`[skrivle] message body:\n${mail.text}`);
    return false;
  }

  try {
    await getTransport().sendMail({
      from: `Skrivle <${config.mail.address}>`,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return true;
  } catch (err) {
    console.error("[skrivle] mail send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Verify the credentials actually work. Used by tooling, not the request path. */
export async function verifyMailTransport(): Promise<boolean> {
  if (!featureEnabled.mail) return false;
  try {
    await getTransport().verify();
    return true;
  } catch (err) {
    console.error("[skrivle] mail transport unusable:", err instanceof Error ? err.message : err);
    return false;
  }
}
