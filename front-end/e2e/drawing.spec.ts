import { expect, test, type Page } from "@playwright/test";

// The drawing tools, over the real wire.
//
// Everything here is two separate browser contexts rather than two tabs, for
// the same reason board.spec.ts is: separate cookie jars AND separate
// localStorage, so it is two people rather than one person twice.

async function newBoard(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "New board" }).first().click();
  await expect(page).toHaveURL(/\/board\/[a-z0-9-]{3,32}$/);
  await settled(page);
  return page.url();
}

/** The §7 settle: the doc has arrived and the canvas is live. */
async function settled(page: Page) {
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="board-canvas"]')?.getAttribute("data-settled") ===
      "true",
  );
}

/** Canvas-relative coordinates to page ones. */
async function canvasAt(page: Page, x: number, y: number): Promise<[number, number]> {
  const box = await page.getByTestId("board-canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  return [box.x + x, box.y + y];
}

async function pickTool(page: Page, key: string) {
  await page.getByTestId("board-canvas").click({ position: { x: 8, y: 8 } });
  await page.keyboard.press(key);
}

async function dragOut(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...(await canvasAt(page, ...from)));
  await page.mouse.down();
  await page.mouse.move(...(await canvasAt(page, ...to)), { steps: 8 });
  await page.mouse.up();
}

const elements = (page: Page) => page.getByTestId("board-element");
const kinds = (page: Page) =>
  page.$$eval('[data-testid="board-element"]', (els) =>
    els.map((el) => (el as HTMLElement).dataset.kind),
  );

test("each tool draws the element it is named for", async ({ page }) => {
  await newBoard(page);

  await pickTool(page, "n");
  await page.mouse.click(...(await canvasAt(page, 200, 200)));
  await page.keyboard.press("Escape");

  await pickTool(page, "r");
  await dragOut(page, [400, 140], [560, 240]);

  await pickTool(page, "o");
  await dragOut(page, [620, 140], [760, 260]);

  await pickTool(page, "l");
  await dragOut(page, [400, 320], [600, 380]);

  await pickTool(page, "p");
  await page.mouse.move(...(await canvasAt(page, 200, 450)));
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(...(await canvasAt(page, 200 + i * 12, 450 + Math.sin(i / 2) * 30)));
  }
  await page.mouse.up();

  await expect(elements(page)).toHaveCount(5);
  expect((await kinds(page)).sort()).toEqual(["ellipse", "line", "note", "path", "rect"]);
});

test("a note is placed at its minimum size and opens for typing", async ({ page }) => {
  await newBoard(page);

  await pickTool(page, "n");
  await page.mouse.click(...(await canvasAt(page, 300, 300)));

  // §10.7 — min 160x160, centred on the click.
  const note = page.locator('[data-kind="note"]');
  await expect(note).toHaveCSS("width", "160px");
  await expect(note).toHaveCSS("height", "160px");

  // Straight into the text, because an empty note is not the point.
  await expect(note.locator("textarea")).toBeFocused();
  await page.keyboard.type("hello");
  await expect(note.locator("textarea")).toHaveValue("hello");
});

test("what one person draws, the other sees", async ({ browser }) => {
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  const a = await alice.newPage();
  const b = await bob.newPage();

  try {
    const url = await newBoard(a);
    await b.goto(url);
    await settled(b);

    await pickTool(a, "n");
    await a.mouse.click(...(await canvasAt(a, 260, 240)));
    await a.keyboard.type("shared");
    await a.keyboard.press("Escape");

    // The note, and the text inside it, both cross the wire.
    await expect(elements(b)).toHaveCount(1);
    await expect(b.locator('[data-kind="note"]')).toContainText("shared");

    // ...and so does a move.
    const before = await b.locator('[data-kind="note"]').evaluate((el) => (el as HTMLElement).style.left);
    await pickTool(a, "v");
    await a.mouse.move(...(await canvasAt(a, 260, 240)));
    await a.mouse.down();
    await a.mouse.move(...(await canvasAt(a, 460, 340)), { steps: 8 });
    await a.mouse.up();

    await expect
      .poll(async () =>
        b.locator('[data-kind="note"]').evaluate((el) => (el as HTMLElement).style.left),
      )
      .not.toBe(before);
  } finally {
    await alice.close();
    await bob.close();
  }
});

test("a stroke appears while it is still being drawn, not only on release", async ({
  browser,
}) => {
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  const a = await alice.newPage();
  const b = await bob.newPage();

  try {
    const url = await newBoard(a);
    await b.goto(url);
    await settled(b);

    await pickTool(a, "p");
    await a.mouse.move(...(await canvasAt(a, 200, 300)));
    await a.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await a.mouse.move(...(await canvasAt(a, 200 + i * 15, 300 + i * 4)));
      await a.waitForTimeout(20);
    }

    // Still held down: the point of the 50ms flush is that peers watch it grow.
    await expect(b.locator('[data-kind="path"]')).toBeVisible();
    const partial = await b.locator('[data-kind="path"] path').getAttribute("d");
    expect(partial?.length ?? 0).toBeGreaterThan(0);

    await a.mouse.up();
  } finally {
    await alice.close();
    await bob.close();
  }
});

test("undo takes back your own work and never a peer's", async ({ browser }) => {
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  const a = await alice.newPage();
  const b = await bob.newPage();

  try {
    const url = await newBoard(a);
    await b.goto(url);
    await settled(b);

    await pickTool(a, "r");
    await dragOut(a, [200, 200], [320, 300]);
    await pickTool(b, "o");
    await dragOut(b, [500, 200], [620, 320]);

    await expect(elements(a)).toHaveCount(2);
    await expect(elements(b)).toHaveCount(2);

    await a.getByTestId("board-canvas").click({ position: { x: 8, y: 8 } });
    await a.keyboard.press("ControlOrMeta+z");

    // Alice's rectangle is gone; Bob's circle is untouched, on both screens.
    await expect(elements(a)).toHaveCount(1);
    await expect(a.locator('[data-kind="ellipse"]')).toHaveCount(1);
    await expect(elements(b)).toHaveCount(1);
    await expect(b.locator('[data-kind="ellipse"]')).toHaveCount(1);
  } finally {
    await alice.close();
    await bob.close();
  }
});

test("marquee selects several elements and Delete removes them", async ({ page }) => {
  await newBoard(page);

  await pickTool(page, "r");
  await dragOut(page, [150, 150], [250, 230]);
  await pickTool(page, "r");
  await dragOut(page, [300, 150], [400, 230]);
  await pickTool(page, "r");
  await dragOut(page, [700, 400], [800, 480]);
  await expect(elements(page)).toHaveCount(3);

  await pickTool(page, "v");
  await dragOut(page, [100, 100], [450, 280]);

  // Two caught, the far one left alone.
  await expect(page.getByTestId("board-selection")).toHaveCount(2);

  await page.keyboard.press("Delete");
  await expect(elements(page)).toHaveCount(1);
});

test("an unfilled shape is grabbed by its edge, not through its middle", async ({ page }) => {
  await newBoard(page);

  await pickTool(page, "r");
  await dragOut(page, [300, 200], [500, 340]);
  await pickTool(page, "v");

  // §10.8 shapes have no fill, so the hollow middle belongs to whatever is
  // behind it — this is what lets you click a note through a rectangle.
  await page.mouse.click(...(await canvasAt(page, 400, 270)));
  await expect(page.getByTestId("board-selection")).toHaveCount(0);

  await page.mouse.click(...(await canvasAt(page, 400, 200)));
  await expect(page.getByTestId("board-selection")).toHaveCount(1);
  // §10.7 — 6px square handles at corners and edge midpoints.
  await expect(page.locator("[data-handle]")).toHaveCount(8);
});

test("the canvas pans and zooms without moving the page", async ({ page }) => {
  await newBoard(page);
  const canvas = page.getByTestId("board-canvas");

  const read = () =>
    page.$eval(
      '[data-testid="board-canvas"] .origin-top-left',
      (el) => (el as HTMLElement).style.transform,
    );

  const start = await read();
  await canvas.hover({ position: { x: 400, y: 300 } });
  await page.mouse.wheel(0, 200);
  await expect.poll(read).not.toBe(start);

  // Ctrl+wheel zooms the board. React registers wheel as a passive listener, so
  // this only works because the handler is attached natively — otherwise the
  // browser would zoom the whole page instead.
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -240);
  await page.keyboard.up("Control");

  await expect
    .poll(async () => page.$eval('[data-testid="board-canvas"] .origin-top-left', (el) =>
      parseFloat((el as HTMLElement).style.getPropertyValue("--cam-scale")),
    ))
    .toBeGreaterThan(1);
});
