import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

vi.mock("@/lib/api/boards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/boards")>();
  return { ...actual, createBoard: vi.fn(), checkBoardIdAvailable: vi.fn() };
});

import { checkBoardIdAvailable, createBoard } from "@/lib/api/boards";
import { CreateBoardDialog } from "./CreateBoardDialog";

const BOARD = {
  id: "sprint-42",
  title: "Sprint 42",
  isEphemeral: true,
  expiresAt: "2099-01-01T00:00:00.000Z",
  updatedAt: "2099-01-01T00:00:00.000Z",
  hasOwner: false,
  thumbnailUrl: null,
  creatorToken: "secret-token",
};

function renderDialog(overrides: Partial<Parameters<typeof CreateBoardDialog>[0]> = {}) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const utils = render(
    <CreateBoardDialog open onClose={onClose} onCreated={onCreated} {...overrides} />,
  );
  return { ...utils, onClose, onCreated };
}

beforeEach(() => vi.clearAllMocks());

describe("CreateBoardDialog", () => {
  it("renders nothing when closed", () => {
    render(<CreateBoardDialog open={false} onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("creates with the trimmed id and title, then reports the board", async () => {
    const user = userEvent.setup();
    vi.mocked(createBoard).mockResolvedValue(BOARD);
    const { onCreated, onClose } = renderDialog();

    await user.type(screen.getByLabelText("Board id"), "  sprint-42  ");
    await user.type(screen.getByLabelText(/Title/), "Sprint 42");
    await user.click(screen.getByRole("button", { name: "Create board" }));

    await waitFor(() =>
      expect(createBoard).toHaveBeenCalledWith({ customId: "sprint-42", title: "Sprint 42" }),
    );
    expect(onCreated).toHaveBeenCalledWith(BOARD);
    expect(onClose).toHaveBeenCalled();
  });

  it("creates with no options when both fields are left blank", async () => {
    const user = userEvent.setup();
    vi.mocked(createBoard).mockResolvedValue({ ...BOARD, creatorToken: null });
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Create board" }));

    await waitFor(() => expect(createBoard).toHaveBeenCalledWith({}));
  });

  it("flags a malformed id without calling the availability check", async () => {
    const user = userEvent.setup();
    renderDialog();

    const idField = screen.getByLabelText("Board id");
    await user.type(idField, "no");
    await user.tab();

    expect(await screen.findByText(/3–32 letters, numbers, or hyphens/)).toBeInTheDocument();
    expect(checkBoardIdAvailable).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create board" })).toBeDisabled();
  });

  it("checks availability on blur and blocks submit when the id is taken", async () => {
    const user = userEvent.setup();
    vi.mocked(checkBoardIdAvailable).mockResolvedValue({ available: false });
    renderDialog();

    await user.type(screen.getByLabelText("Board id"), "sprint-42");
    await user.tab();

    await waitFor(() => expect(checkBoardIdAvailable).toHaveBeenCalledWith("sprint-42"));
    expect(await screen.findByText("That id is already taken.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create board" })).toBeDisabled();
    expect(createBoard).not.toHaveBeenCalled();
  });

  it("clears a resolved availability check as soon as the id is edited again", async () => {
    const user = userEvent.setup();
    vi.mocked(checkBoardIdAvailable).mockResolvedValue({ available: false });
    renderDialog();

    const idField = screen.getByLabelText("Board id");
    await user.type(idField, "sprint-42");
    await user.tab();
    await screen.findByText("That id is already taken.");

    await user.type(idField, "x");
    expect(screen.queryByText("That id is already taken.")).not.toBeInTheDocument();
  });

  it("surfaces a 409 on submit as a field error even past a stale available check", async () => {
    const user = userEvent.setup();
    vi.mocked(checkBoardIdAvailable).mockResolvedValue({ available: true });
    vi.mocked(createBoard).mockRejectedValue(
      new ApiError(409, 'The board id "sprint-42" is already taken.', "Pick a different id."),
    );
    renderDialog();

    await user.type(screen.getByLabelText("Board id"), "sprint-42");
    await user.tab();
    await waitFor(() => expect(checkBoardIdAvailable).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Create board" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      'The board id "sprint-42" is already taken.',
    );
    expect(screen.getByRole("button", { name: "Create board" })).toBeDisabled();
  });

  it("shows a generic problem for a non-409 failure and leaves the form usable", async () => {
    const user = userEvent.setup();
    vi.mocked(createBoard).mockRejectedValue(
      new ApiError(0, "Couldn't reach Skrivle's server.", "Check your connection."),
    );
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Create board" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach Skrivle's server.");
    expect(screen.getByRole("button", { name: "Create board" })).toBeEnabled();
  });

  it("closes on Escape without creating anything", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
    expect(createBoard).not.toHaveBeenCalled();
  });

  it("closes on Cancel", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
  });

  // Regression: NewBoardButton is used inside SiteHeader, whose <header> sets
  // backdrop-blur — a containing block for `position: fixed` descendants that
  // would otherwise pin the scrim to the header bar instead of the viewport.
  it("portals to document.body rather than rendering where it's mounted", () => {
    const { baseElement } = render(
      <div data-testid="ancestor" style={{ textAlign: "center" }}>
        <CreateBoardDialog open onClose={vi.fn()} onCreated={vi.fn()} />
      </div>,
    );

    const dialog = screen.getByRole("dialog");
    expect(screen.queryByTestId("ancestor")).not.toContainElement(dialog);
    expect(baseElement).toContainElement(dialog);
  });

  // Regression: the scroll lock has to unlock again once `open` goes back to
  // false, not just on unmount (which never happens — NewBoardButton always
  // renders this component, only `open` toggles). `open` is a controlled
  // prop here, so the parent flipping it on onClose is simulated by hand.
  it("locks body scroll while open and releases it once closed", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <CreateBoardDialog open onClose={onClose} onCreated={vi.fn()} />,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<CreateBoardDialog open={false} onClose={onClose} onCreated={vi.fn()} />);

    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });
});
