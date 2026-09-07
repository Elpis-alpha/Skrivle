import { expect, type Page, test } from "@playwright/test";

/**
 * Signs in with a real emailed code, captured from the request the UI itself
 * makes — the back-end returns it in the response under AUTH_DEV_CODES
 * (playwright.config.ts).
 *
 * Reading it off the UI's own request rather than making a second one matters:
 * a duplicate request would hit the 60s per-address resend cooldown, which
 * answers 200 having sent nothing, and the second code would never arrive.
 *
 * A fresh address per run keeps the 5/hour per-address limit irrelevant. The
 * per-IP limits (20 requests, 30 verifies per hour) are why e2e gets its own
 * Redis logical database.
 */
export async function signIn(page: Page, next?: string): Promise<string> {
  const email = `e2e-${Date.now()}-${test.info().workerIndex}@skrivle.test`;

  await page.goto(next ? `/signin?next=${encodeURIComponent(next)}` : "/signin");
  await page.getByLabel("Email").fill(email);

  const pending = page.waitForResponse(
    (res) => res.url().endsWith("/api/auth/email/request") && res.status() === 200,
  );
  await page.getByRole("button", { name: "Continue with email" }).click();

  const body = (await (await pending).json()) as { code?: string };
  expect(
    body.code,
    "no code in the response — is AUTH_DEV_CODES=1 set for the e2e back-end?",
  ).toMatch(/^\d{6}$/);

  await page.getByLabel("One-time code").fill(body.code!);
  return email;
}
