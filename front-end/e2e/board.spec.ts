import { expect, test } from "@playwright/test";
import { signIn } from "./helpers/auth";

async function newBoard(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "New board" }).first().click();
  await expect(page).toHaveURL(/\/board\/[a-z0-9-]{3,32}$/);
  return page.url();
}

test("a guest board is created server-side and its token is kept locally", async ({ page }) => {
  const url = await newBoard(page);
  const id = url.split("/").pop()!;

  await expect(page.getByTestId("board-canvas")).toBeVisible();
  // The board is joined and hydrated, so our own presence is showing.
  await expect(page.getByTestId("presence-avatar")).toHaveCount(1);

  // The creator token is the only handle for extending or claiming later.
  const stored = await page.evaluate(() => localStorage.getItem("skrivle-boards"));
  expect(stored).toContain(id);
});

test("two people on one board see each other's cursors", async ({ browser }) => {
  // Separate contexts, not tabs: separate cookie jars AND separate
  // localStorage, so the creator token lives only with the person who made the
  // board. Two real people, not one person twice.
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  const a = await alice.newPage();
  const b = await bob.newPage();

  try {
    const url = await newBoard(a);
    await b.goto(url);

    await expect(a.getByTestId("presence-avatar")).toHaveCount(2);
    await expect(b.getByTestId("presence-avatar")).toHaveCount(2);

    // Two moves: the first may pre-date the join handshake.
    await b.mouse.move(400, 300);
    await b.mouse.move(420, 320);

    await expect(a.getByTestId("remote-cursor")).toHaveCount(1);

    // The payoff: closing a tab must retract the cursor. This is the assertion
    // that proves the server's awareness retraction reaches the browser —
    // without it, ghost cursors accumulate on every board.
    await bob.close();
    await expect(a.getByTestId("remote-cursor")).toHaveCount(0);
    await expect(a.getByTestId("presence-avatar")).toHaveCount(1);
  } finally {
    await alice.close();
    await bob.close().catch(() => {});
  }
});

test("a guest board shows its expiry and can be extended", async ({ page }) => {
  await newBoard(page);

  const chip = page.getByText(/Expires in/);
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("23h");

  await page.getByRole("button", { name: "Extend" }).click();
  await expect(chip).toContainText("47h");
});

test("an unknown board id offers to create it", async ({ page }) => {
  await page.goto("/board/zzzzz");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "doesn't exist yet",
  );
  await expect(page.getByRole("button", { name: /Create board/ })).toBeVisible();
});

test("a malformed board id is rejected without a round trip", async ({ page }) => {
  await page.goto("/board/no");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "isn't a board id",
  );
});

test("signing in on a guest board claims it onto the account", async ({ page }) => {
  const url = await newBoard(page);
  const id = url.split("/").pop()!;

  await signIn(page, `/board/${id}`);
  await expect(page).toHaveURL(new RegExp(`/board/${id}$`));

  // Claimed: no longer ephemeral, so the expiry chip is gone...
  await expect(page.getByText(/Expires in/)).toHaveCount(0);
  // ...and it now appears in My Boards.
  await page.goto("/boards");
  await expect(page.getByRole("link", { name: /Untitled board/ })).toBeVisible();
});

test("My Boards asks you to sign in rather than 404ing", async ({ page }) => {
  const response = await page.goto("/boards");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /Sign in to see your boards/ })).toBeVisible();
});
