import { expect, test, type WebSocketRoute } from "@playwright/test";
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

test("the Share button hands over the board's link", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const url = await newBoard(page);

  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog", { name: "Share this board" });
  await expect(dialog.getByRole("textbox", { name: "Board link" })).toHaveValue(url);

  await dialog.getByRole("button", { name: "Copy link" }).click();

  await expect(page.getByRole("status")).toHaveText("Link copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

  // Not just rendered — on top, where it can be read, not under the dialog's
  // blurred scrim.
  const onTop = await page.getByText("Link copied").evaluate((toast) => {
    const box = toast.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit !== null && toast.contains(hit);
  });
  expect(onTop).toBe(true);
});

test("the zoom control and its keys move the camera", async ({ page }) => {
  await newBoard(page);
  const readout = page.getByRole("button", { name: /reset zoom/i });
  await expect(readout).toHaveText("100%");

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(readout).toHaveText("125%");

  await page.getByTestId("board-canvas").focus();
  await page.keyboard.press("ControlOrMeta+Equal");
  await expect(readout).toHaveText("150%");

  await page.keyboard.press("Shift+Digit0");
  await expect(readout).toHaveText("100%");
});

test("the board's top bar fits a 360px phone without scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 720 });
  await newBoard(page);
  await expect(page.getByTestId("presence-avatar")).toHaveCount(1);

  const overflow = await page
    .locator("header")
    .evaluate((header) => header.scrollWidth - header.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

// §10.21 — the bar while the socket is down, and a toast when it's back.
test("losing the connection shows Reconnecting, and coming back says so", async ({
  page,
  context,
}) => {
  // Going offline doesn't close a WebSocket that's already open, so the test
  // sits in the middle of it and closes it from there.
  //
  // Socket.IO starts on long-polling and moves to the WebSocket once it has
  // probed it; cut the WebSocket before then and the client simply stays on
  // polling. Engine.IO's "5" packet is the client committing to the upgrade.
  const sockets: WebSocketRoute[] = [];
  let upgraded = false;
  await context.routeWebSocket(/\/socket\.io\//, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      if (message === "5") upgraded = true;
      server.send(message);
    });
    server.onMessage((message) => ws.send(message));
    sockets.push(ws);
  });

  await newBoard(page);
  await expect(page.getByTestId("presence-avatar")).toHaveCount(1);
  await expect.poll(() => upgraded).toBe(true);

  await context.setOffline(true);
  for (const ws of sockets) await ws.close();
  await expect(page.getByText(/Reconnecting…/)).toBeVisible();
  await expect(page.getByTestId("board-canvas")).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("Back online")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Reconnecting…/)).toHaveCount(0);
});

// §10.11 — pressing the cluster lists everyone, with their role.
test("the avatar cluster lists who's on the board, and who owns it", async ({ browser }) => {
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  const a = await alice.newPage();
  const b = await bob.newPage();

  try {
    // Alice makes a board as a guest and claims it by signing in.
    const url = await newBoard(a);
    const id = url.split("/").pop()!;
    await signIn(a, `/board/${id}`);
    await expect(a).toHaveURL(new RegExp(`/board/${id}$`));
    await expect(a.getByText(/Expires in/)).toHaveCount(0);

    await b.goto(url);
    await expect(a.getByTestId("presence-avatar")).toHaveCount(2);
    await expect(b.getByTestId("presence-avatar")).toHaveCount(2);

    const rows = (page: typeof a) =>
      page.getByRole("list", { name: "On this board" }).getByRole("listitem");

    await b.getByRole("button", { name: /On this board/ }).click();
    await expect(rows(b)).toHaveCount(2);
    await expect(rows(b).nth(0)).toContainText("You · editor");
    await expect(rows(b).nth(1)).toContainText("· owner");

    await a.getByRole("button", { name: /On this board/ }).click();
    await expect(rows(a).nth(0)).toContainText("You · owner");
    await expect(rows(a).nth(1)).toContainText("· editor");

    // Escape closes it.
    await a.keyboard.press("Escape");
    await expect(rows(a)).toHaveCount(0);
  } finally {
    await alice.close();
    await bob.close();
  }
});

// §10.15 — each tile says whose it is and when it last changed.
test("My Boards shows each board's role and when it was last edited", async ({ page }) => {
  await signIn(page, "/boards");
  await expect(page).toHaveURL(/\/boards$/);
  await page.getByRole("button", { name: "New board" }).first().click();
  await expect(page).toHaveURL(/\/board\/[a-z0-9-]{3,32}$/);

  await page.goto("/boards");
  const tile = page.getByRole("link", { name: /Untitled board/ });
  await expect(tile).toContainText("owner");
  await expect(tile).toContainText("edited just now");
});
