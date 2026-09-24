import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

function renderDialog(open = true) {
  const onClose = vi.fn();
  const utils = render(
    <Dialog open={open} onClose={onClose} title="Share this board">
      <button type="button">First</button>
      <button type="button">Last</button>
    </Dialog>,
  );
  return { ...utils, onClose };
}

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    renderDialog(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a modal dialog named by its title, holding its content", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Share this board" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toContainElement(screen.getByRole("button", { name: "First" }));
  });

  it("portals to document.body rather than rendering where it's mounted", () => {
    render(
      <div data-testid="ancestor">
        <Dialog open onClose={vi.fn()} title="t">
          x
        </Dialog>
      </div>,
    );
    expect(screen.getByTestId("ancestor")).not.toContainElement(screen.getByRole("dialog"));
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes from its close button", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on a press on the scrim, but not on one inside the panel", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "First" }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("dialog-scrim"));
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps Tab inside the panel", async () => {
    const user = userEvent.setup();
    renderDialog();

    screen.getByRole("button", { name: "Last" }).focus();
    await user.tab();

    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("hands focus back to whatever opened it", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="t">
            x
          </Dialog>
        </>
      );
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toHaveFocus());
  });

  it("locks body scroll while open and releases it once closed", async () => {
    const { rerender } = render(
      <Dialog open onClose={vi.fn()} title="t">
        x
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Dialog open={false} onClose={vi.fn()} title="t">
        x
      </Dialog>,
    );
    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });
});
