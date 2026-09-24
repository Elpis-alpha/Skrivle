import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { BoardWithRole } from "@/lib/api/types";

vi.mock("@/lib/api/boards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/boards")>();
  return { ...actual, renameBoard: vi.fn() };
});

import { renameBoard } from "@/lib/api/boards";
import { ToastProvider } from "@/components/ui/Toast";
import { BoardTitle } from "./BoardTitle";

const BOARD: BoardWithRole = {
  id: "swmvs",
  title: "Sprint 42",
  isEphemeral: false,
  expiresAt: null,
  updatedAt: "2099-01-01T00:00:00.000Z",
  hasOwner: true,
  thumbnailUrl: null,
  role: "owner",
};

function renderTitle(board: BoardWithRole = BOARD) {
  const onRenamed = vi.fn();
  const utils = render(
    <ToastProvider>
      <BoardTitle board={board} onRenamed={onRenamed} />
    </ToastProvider>,
  );
  return { ...utils, onRenamed };
}

beforeEach(() => vi.clearAllMocks());

describe("BoardTitle", () => {
  it("is plain text for anyone who doesn't own the board", () => {
    renderTitle({ ...BOARD, role: "editor" });
    expect(screen.getByRole("heading", { name: "Sprint 42" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens for editing, with the whole title selected, when the owner clicks it", async () => {
    const user = userEvent.setup();
    renderTitle();

    await user.click(screen.getByRole("button", { name: /rename/i }));

    const field = screen.getByRole("textbox", { name: "Board title" });
    expect(field).toHaveValue("Sprint 42");
    expect(field).toHaveFocus();
    expect((field as HTMLInputElement).selectionEnd).toBe("Sprint 42".length);
  });

  it("saves on Enter, trimmed, and says so", async () => {
    const user = userEvent.setup();
    vi.mocked(renameBoard).mockResolvedValue({ ...BOARD, title: "Sprint 43" });
    const { onRenamed } = renderTitle();

    await user.click(screen.getByRole("button", { name: /rename/i }));
    await user.clear(screen.getByRole("textbox", { name: "Board title" }));
    await user.keyboard("  Sprint 43  {Enter}");

    expect(renameBoard).toHaveBeenCalledWith("swmvs", "Sprint 43");
    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith({ ...BOARD, title: "Sprint 43" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Title saved");
  });

  it("saves when focus leaves the field", async () => {
    const user = userEvent.setup();
    vi.mocked(renameBoard).mockResolvedValue({ ...BOARD, title: "Sprint 43" });
    renderTitle();

    await user.click(screen.getByRole("button", { name: /rename/i }));
    await user.clear(screen.getByRole("textbox", { name: "Board title" }));
    await user.keyboard("Sprint 43");
    await user.tab();

    expect(renameBoard).toHaveBeenCalledWith("swmvs", "Sprint 43");
  });

  it("puts everything back on Escape", async () => {
    const user = userEvent.setup();
    renderTitle();

    await user.click(screen.getByRole("button", { name: /rename/i }));
    await user.keyboard("Something else{Escape}");

    expect(renameBoard).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /rename/i })).toHaveTextContent("Sprint 42");
  });

  it("doesn't send a blank or unchanged title", async () => {
    const user = userEvent.setup();
    renderTitle();

    await user.click(screen.getByRole("button", { name: /rename/i }));
    await user.clear(screen.getByRole("textbox", { name: "Board title" }));
    await user.keyboard("   {Enter}");
    await user.click(screen.getByRole("button", { name: /rename/i }));
    await user.keyboard("{Enter}");

    expect(renameBoard).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /rename/i })).toHaveTextContent("Sprint 42");
  });

  it("keeps the old title and says why when the rename fails", async () => {
    const user = userEvent.setup();
    vi.mocked(renameBoard).mockRejectedValue(
      new ApiError(403, "Only the owner can rename this board.", "Ask them to."),
    );
    const { onRenamed } = renderTitle();

    await user.click(screen.getByRole("button", { name: /rename/i }));
    await user.clear(screen.getByRole("textbox", { name: "Board title" }));
    await user.keyboard("Sprint 43{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only the owner can rename this board.",
    );
    expect(onRenamed).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /rename/i })).toHaveTextContent("Sprint 42");
  });
});
