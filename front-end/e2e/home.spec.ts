import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows the wordmark in the header", async ({ page }) => {
    await expect(
      page.getByRole("banner").getByText("skrivle", { exact: true }),
    ).toBeVisible();
  });

  test("New board creates a board and goes to it", async ({ page }) => {
    await page.getByRole("button", { name: "New board" }).first().click();
    await expect(page).toHaveURL(/\/board\/[a-z0-9]{5}$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "canvas isn't built yet",
    );
  });

  test("joining with a pasted link goes to that board", async ({ page }) => {
    await page
      .getByLabel("Already have a link?")
      .fill("https://skrivle.elpis.cc/board/sprint-42");
    await page.getByRole("button", { name: "Join" }).click();
    await expect(page).toHaveURL(/\/board\/sprint-42$/);
  });

  test("joining with a bare id goes to that board", async ({ page }) => {
    await page.getByLabel("Already have a link?").fill("k3m9p");
    await page.getByRole("button", { name: "Join" }).click();
    await expect(page).toHaveURL(/\/board\/k3m9p$/);
  });

  test("a bad board id is rejected in place, naming the fix", async ({ page }) => {
    await page.getByLabel("Already have a link?").fill("no");
    await page.getByRole("button", { name: "Join" }).click();
    // Scoped to the form: Next's route announcer is also a role="alert".
    const form = page.locator("main form").filter({ hasText: "Already have a link?" });
    await expect(form.getByRole("alert")).toContainText("3–32 letters");
    await expect(page).toHaveURL("/");
  });

  test("the theme toggle flips the theme and remembers it", async ({ page }) => {
    const html = page.locator("html");
    const before = await html.getAttribute("data-theme");
    const expected = before === "dark" ? "light" : "dark";

    await page.getByRole("button", { name: /switch to .* theme/i }).first().click();
    await expect(html).toHaveAttribute("data-theme", expected);

    await page.reload();
    await expect(html).toHaveAttribute("data-theme", expected);
  });
});

test("every header and footer link resolves", async ({ page, request }) => {
  await page.goto("/");

  const hrefs = await page
    .locator("header a, footer a")
    .evaluateAll((links) =>
      links
        .map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? "")
        .filter((href) => href.startsWith("/")),
    );

  // Anchors like /#features resolve to the landing page itself.
  const paths = [...new Set(hrefs.map((href) => href.split("#")[0] || "/"))];
  expect(paths.length).toBeGreaterThan(4);

  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status(), `${path} should not 404`).toBe(200);
  }
});

test("the mobile menu opens, navigates, and closes", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");

  await page.getByRole("button", { name: "Open menu" }).click();
  const close = page.getByRole("button", { name: "Close menu" });
  await expect(close).toBeVisible();

  await close.click();
  await expect(close).toBeHidden();
  // Closing hands focus back to the control that opened it, not to the body.
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
});

test("the mobile menu closes on Escape and traps Tab while open", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");

  await page.getByRole("button", { name: "Open menu" }).click();
  const panel = page.getByRole("dialog", { name: "Menu" });
  await expect(panel).toBeVisible();

  // Shift+Tab from the first control wraps to the last, instead of escaping
  // into the page behind the panel.
  await page.keyboard.press("Shift+Tab");
  await expect(panel.getByRole("link", { name: "Sign in" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
});

test("the mobile menu doesn't leave the page scroll-locked when widened", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();

  // The panel is lg:hidden, so widening past lg would hide it while the body
  // stayed locked and nothing on screen could unlock it.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("nothing overflows horizontally at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");

  const overflow = await page.evaluate(() => {
    const limit = document.body.getBoundingClientRect().width + 1;
    return [...document.querySelectorAll("body *")].filter(
      (el) => el.getBoundingClientRect().right > limit,
    ).length;
  });

  expect(overflow).toBe(0);
});

test.describe("scroll reveals never strand content", () => {
  test("the server sends every section visible, in case JS never arrives", async ({
    request,
  }) => {
    const html = await (await request.get("/")).text();
    expect(html).not.toContain("opacity:0");
    expect(html).toContain("Built in the open");
  });

  test("deep-linking past a section still reveals it", async ({ page }) => {
    // A #hash jump crosses no IntersectionObserver threshold, so sections it
    // skips must be revealed by the scroll fallback rather than left blank.
    await page.goto("/#faq");
    await expect(page.getByRole("heading", { name: "Questions" })).toBeVisible();

    await expect
      .poll(() =>
        page.locator('main [style*="opacity: 0"]').count(),
      )
      .toBe(0);

    await expect(page.getByRole("heading", { name: "Built in the open" })).toBeVisible();
  });
});

test("an unknown page returns the 404 in the product's voice", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "nothing at this address",
  );
});
