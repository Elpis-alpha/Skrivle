import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/auth")>();
  return { ...actual, getMe: vi.fn(), logout: vi.fn() };
});

import { getMe, logout } from "@/lib/api/auth";
import { SessionProvider } from "@/lib/session/SessionProvider";
import { UserMenu } from "./UserMenu";

const NO_METHODS = { email: false, github: false, google: false };
const USER = { id: "u1", email: "a@b.co", name: "Maya Chen", avatarUrl: null };

function renderMenu(user: typeof USER | null = USER) {
  vi.mocked(getMe).mockResolvedValue({ user, methods: NO_METHODS });
  return render(
    <SessionProvider>
      <UserMenu />
    </SessionProvider>,
  );
}

async function ready() {
  await waitFor(() => expect(getMe).toHaveBeenCalled());
}

beforeEach(() => vi.clearAllMocks());

describe("UserMenu", () => {
  it("shows Sign in while signed out", async () => {
    renderMenu(null);
    await ready();

    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/signin",
    );
  });

  it("never shows Sign in once a user is present", async () => {
    renderMenu();
    await ready();

    await screen.findByRole("button", { name: /Account menu for Maya Chen/ });
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("opens a menu with My Boards and Sign out", async () => {
    const user = userEvent.setup();
    renderMenu();
    await ready();

    await user.click(await screen.findByRole("button", { name: /Account menu/ }));

    expect(screen.getByRole("menuitem", { name: "My Boards" })).toHaveAttribute(
      "href",
      "/boards",
    );
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });

  it("signs out, closes the menu, and returns home", async () => {
    const user = userEvent.setup();
    vi.mocked(logout).mockResolvedValue(undefined);
    renderMenu();
    await ready();

    await user.click(await screen.findByRole("button", { name: /Account menu/ }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(logout).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    // Signed out again — the trigger reverts to the Sign in link.
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("closes the menu on Escape", async () => {
    const user = userEvent.setup();
    renderMenu();
    await ready();

    await user.click(await screen.findByRole("button", { name: /Account menu/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
