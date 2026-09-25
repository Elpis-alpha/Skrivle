import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TileMenu } from "./TileMenu";

const handlers = () => ({ onRename: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() });

const trigger = () => screen.getByRole("button", { name: "More for Sprint" });
const items = () => screen.getAllByRole("menuitem").map((item) => item.textContent);

function open(owner = true) {
  const on = handlers();
  render(<TileMenu title="Sprint" owner={owner} {...on} />);
  fireEvent.click(trigger());
  return on;
}

describe("TileMenu", () => {
  // §10.15 — "Overflow menu (⋯): Rename, Duplicate, Delete".
  it("offers the owner Rename, Duplicate and Delete", () => {
    open(true);
    expect(items()).toEqual(["Rename", "Duplicate", "Delete"]);
  });

  // The API refuses the others from anyone but the owner.
  it("offers an editor only Duplicate", () => {
    open(false);
    expect(items()).toEqual(["Duplicate"]);
  });

  it("stays shut until pressed", () => {
    render(<TileMenu title="Sprint" owner {...handlers()} />);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("does what's chosen, and closes", () => {
    const on = open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    expect(on.onDuplicate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  // §10.18 — "Full keyboard nav".
  it("moves focus through the items with the arrow keys, wrapping at the ends", () => {
    open();
    const menu = screen.getByRole("menu");
    const [rename, duplicate, remove] = screen.getAllByRole("menuitem");

    expect(rename).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(duplicate).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(remove).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(rename).toHaveFocus();
    fireEvent.keyDown(menu, { key: "End" });
    expect(remove).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(rename).toHaveFocus();
  });

  it("closes on Escape, handing focus back to the button", () => {
    open();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it("closes on a press anywhere else", () => {
    open();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
