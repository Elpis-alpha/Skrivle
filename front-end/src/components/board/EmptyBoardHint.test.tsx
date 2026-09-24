import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { ToastProvider } from "@/components/ui/Toast";
import { createElement } from "@/lib/board/elements";
import { EmptyBoardHint } from "./EmptyBoardHint";

function renderHint(doc: Y.Doc, hydrated = true) {
  return render(
    <ToastProvider>
      <EmptyBoardHint doc={doc} hydrated={hydrated} boardId="swmvs" />
    </ToastProvider>,
  );
}

describe("EmptyBoardHint", () => {
  it("says how to start on an empty board", () => {
    renderHint(new Y.Doc());
    expect(screen.getByText(/this board is empty/i)).toBeInTheDocument();
  });

  // Before the document arrives, empty means "not loaded yet", not "empty".
  it("waits for the document before saying the board is empty", () => {
    renderHint(new Y.Doc(), false);
    expect(screen.queryByText(/this board is empty/i)).toBeNull();
  });

  it("never shows on a board that has something on it", () => {
    const doc = new Y.Doc();
    createElement(doc, { kind: "rect", x: 0, y: 0, w: 10, h: 10 });
    renderHint(doc);
    expect(screen.queryByText(/this board is empty/i)).toBeNull();
  });

  it("gets out of the way the moment the first thing lands, from anyone", () => {
    const doc = new Y.Doc();
    renderHint(doc);

    act(() => {
      createElement(doc, { kind: "rect", x: 0, y: 0, w: 10, h: 10 });
    });

    expect(screen.queryByText(/this board is empty/i)).toBeNull();
  });

  it("offers the link, since drawing together is the point", async () => {
    const user = userEvent.setup();
    renderHint(new Y.Doc());

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/board/swmvs`);
  });
});
