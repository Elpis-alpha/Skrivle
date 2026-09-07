// Email bodies. Colours and voice follow docs/STYLE_GUIDE.md: amethyst
// (--accent-700 #32174d) for emphasis, purple-tinted ink rather than black,
// Poppins with a real fallback stack since almost no mail client will load a
// webfont.
//
// Everything is inline-styled and table-free-but-simple on purpose: mail
// clients strip <style> blocks, and Gmail in particular ignores anything but
// inline declarations.
import { CODE_LENGTH } from "../auth/otp.js";
import type { Mail } from "./transport.js";

const FONT = "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const INK = "#241631";
const INK_MUTED = "#6f6579";
const ACCENT = "#32174d";
const PAPER = "#ffffff";
const SUBTLE = "#f4eef9";
const BORDER = "#e7dbf1";

/** Minutes a code stays valid — kept in sync with TTL.otp for the copy. */
const VALID_MINUTES = 10;

export function signInCodeEmail(to: string, code: string): Mail {
  // Grouped 3-3 so it is easy to read off a phone and retype.
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;

  const text = [
    `Your Skrivle sign-in code is ${spaced}`,
    "",
    `Enter it on the sign-in page. It works once and expires in ${VALID_MINUTES} minutes.`,
    "",
    "If you didn't ask to sign in, you can ignore this — the code is useless without your email inbox.",
  ].join("\n");

  const html = `
<div style="margin:0;padding:32px 16px;background:${SUBTLE};font-family:${FONT};">
  <div style="max-width:440px;margin:0 auto;background:${PAPER};border:1px solid ${BORDER};border-radius:14px;padding:32px;">
    <p style="margin:0 0 24px;font-size:18px;font-weight:600;color:${ACCENT};letter-spacing:-0.01em;">Skrivle</p>

    <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:${INK};letter-spacing:-0.01em;">Your sign-in code</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${INK_MUTED};">
      Enter this ${CODE_LENGTH}-digit code to finish signing in.
    </p>

    <div style="margin:0 0 24px;padding:20px;background:${SUBTLE};border-radius:10px;text-align:center;">
      <span style="font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:600;color:${ACCENT};letter-spacing:0.14em;">${spaced}</span>
    </div>

    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:${INK_MUTED};">
      It works once and expires in ${VALID_MINUTES} minutes.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${INK_MUTED};">
      Didn't ask to sign in? Ignore this message — the code is useless without access to your inbox.
    </p>
  </div>
</div>`.trim();

  return { to, subject: `${spaced} is your Skrivle sign-in code`, text, html };
}
