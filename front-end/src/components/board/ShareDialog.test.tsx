import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/board/swmvs",
}));

vi.mock("@/lib/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/auth")>();
  return { ...actual, getMe: vi.fn() };
});

import { getMe } from "@/lib/api/auth";
import { ToastProvider } from "@/components/ui/Toast";
import { SessionProvider } from "@/lib/session/SessionProvider";
import { ShareDialog } from "./ShareDialog";

const url = () => `${window.location.origin}/board/swmvs`;

function renderShare({ guest = true } = {}) {
  vi.mocked(getMe).mockResolvedValue({
    user: null,
    methods: { email: true, github: false, google: false },
  });
  return render(
    <SessionProvider>
      <ToastProvider>
        <ShareDialog open onClose={vi.fn()} boardId="swmvs" guest={guest} />
      </ToastProvider>
    </SessionProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ShareDialog", () => {
  it("shows the board's link, ready to copy by hand if need be", () => {
    renderShare();
    const field = screen.getByRole("textbox", { name: "Board link" });
    expect(field).toHaveValue(url());
    expect(field).toHaveAttribute("readonly");
  });

  it("says who the link lets in", () => {
    renderShare();
    expect(screen.getByText("Anyone with this link can edit.")).toBeInTheDocument();
  });

  it("copies the link and says so", async () => {
    const user = userEvent.setup();
    renderShare();

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(await navigator.clipboard.readText()).toBe(url());
    expect(await screen.findByRole("status")).toHaveTextContent("Link copied");
  });

  it("says what to do when the clipboard refuses", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    renderShare();

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't copy/i);
  });

  it("offers a guest the way to keep the board", async () => {
    renderShare({ guest: true });
    expect(screen.getByText("Sign in to keep this board after it expires.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Email")).toBeInTheDocument());
  });

  it("doesn't pitch sign-in to someone already signed in", () => {
    renderShare({ guest: false });
    expect(screen.queryByText(/sign in to keep/i)).toBeNull();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });
});
