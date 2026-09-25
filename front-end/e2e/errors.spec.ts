import { expect, test } from "@playwright/test";

// instrumentation-client.ts is a file convention: misname it and Next skips it
// without a word. So this checks the whole path, from a thrown error to the
// API's answer, across the real origins.

test("an error nothing caught is reported to the API", async ({ page }) => {
  await page.goto("/faq");

  const posted = page.waitForRequest(
    (req) => req.method() === "POST" && new URL(req.url()).pathname === "/api/errors",
  );
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error("e2e: thrown from a timer");
    });
  });

  const request = await posted;
  expect(request.postDataJSON()).toMatchObject({
    source: "window",
    message: "e2e: thrown from a timer",
    path: "/faq",
  });
  expect((await request.response())?.status()).toBe(204);
});
