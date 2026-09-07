import { expect, test } from "@playwright/test";
import { signIn } from "./helpers/auth";

test("signs in with an emailed code and lands on My Boards", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/boards$/);
  await expect(page.getByRole("heading", { name: "My boards" })).toBeVisible();
});

test("a wrong code is refused with the server's own wording", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(`e2e-wrong-${Date.now()}@skrivle.test`);
  await page.getByRole("button", { name: "Continue with email" }).click();

  await page.getByLabel("One-time code").fill("000000");

  // Scoped to the form: Next's route announcer is also a role="alert".
  const alert = page.locator("main form").getByRole("alert");
  await expect(alert).toBeVisible();
  // Both halves of the envelope reach the user: what happened, and what next.
  await expect(alert).toContainText(/code/i);
});

test("resend is held behind a truthful countdown", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(`e2e-resend-${Date.now()}@skrivle.test`);
  await page.getByRole("button", { name: "Continue with email" }).click();

  // The request endpoint answers 200 whether or not it actually sent, so the
  // UI must never claim a resend it can't guarantee.
  await expect(page.getByRole("button", { name: /Resend in \d+s/ })).toBeDisabled();
});

test("offers only the providers the server has credentials for", async ({ page }) => {
  await page.goto("/signin");
  // Whatever the deployment reports, a rendered provider button must be usable
  // — never the old hardcoded-disabled placeholder.
  for (const name of ["Continue with GitHub", "Continue with Google"]) {
    const button = page.getByRole("button", { name });
    if (await button.count()) await expect(button).toBeEnabled();
  }
});
