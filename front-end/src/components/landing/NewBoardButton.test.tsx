import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/api/boards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/boards")>();
  return { ...actual, createBoard: vi.fn(), checkBoardIdAvailable: vi.fn() };
});

import { createBoard } from "@/lib/api/boards";
import { NewBoardButton } from "./NewBoardButton";

const BOARD = {
  id: "k3m9p",
  title: "",
  isEphemeral: true,
  expiresAt: "2099-01-01T00:00:00.000Z",
  updatedAt: "2099-01-01T00:00:00.000Z",
  hasOwner: false,
  thumbnailUrl: null,
  creatorToken: "secret-token",
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("NewBoardButton", () => {
  it("the main click still creates and navigates with no dialog involved", async () => {
    const user = userEvent.setup();
    vi.mocked(createBoard).mockResolvedValue(BOARD);
    render(<NewBoardButton>New board</NewBoardButton>);

    await user.click(screen.getByRole("button", { name: "New board" }));

    expect(createBoard).toHaveBeenCalledWith();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/board/k3m9p"));
    expect(window.localStorage.getItem("skrivle-boards")).toContain("secret-token");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stops the spinner and shows an error when the quick create fails", async () => {
    const user = userEvent.setup();
    vi.mocked(createBoard).mockRejectedValue(
      new ApiError(429, "Too many boards.", "Wait a bit."),
    );
    render(<NewBoardButton>New board</NewBoardButton>);

    await user.click(screen.getByRole("button", { name: "New board" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many boards.");
    expect(screen.getByRole("button", { name: "New board" })).toBeEnabled();
  });

  it("opens the create dialog from the chevron, main button untouched", async () => {
    const user = userEvent.setup();
    render(<NewBoardButton>New board</NewBoardButton>);

    await user.click(screen.getByRole("button", { name: "Choose a board id and title" }));

    expect(await screen.findByRole("dialog", { name: "Create a board" })).toBeInTheDocument();
    expect(createBoard).not.toHaveBeenCalled();
  });

  it("shares the same success path from the dialog as the quick create", async () => {
    // Board-id availability racing the submit is CreateBoardDialog's own
    // concern (see CreateBoardDialog.test.tsx); this just proves the dialog's
    // onCreated reaches the same finish() as the one-click path.
    const user = userEvent.setup();
    vi.mocked(createBoard).mockResolvedValue({ ...BOARD, id: "sprint-42", creatorToken: null });
    render(<NewBoardButton>New board</NewBoardButton>);

    await user.click(screen.getByRole("button", { name: "Choose a board id and title" }));
    await screen.findByLabelText("Board id");
    await user.click(screen.getByRole("button", { name: "Create board" }));

    expect(createBoard).toHaveBeenCalledWith({});
    await waitFor(() => expect(push).toHaveBeenCalledWith("/board/sprint-42"));
  });
});
