import { expect, test } from "@playwright/test";

test("home page shows the wordmark", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("skrivle")).toBeVisible();
});
