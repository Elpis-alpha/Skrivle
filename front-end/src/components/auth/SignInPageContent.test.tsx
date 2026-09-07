import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/signin",
}));

vi.mock("@/lib/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/auth")>();
  return { ...actual, getMe: vi.fn(), logout: vi.fn() };
});

import { getMe, logout } from "@/lib/api/auth";
import { SessionProvider } from "@/lib/session/SessionProvider";
import { SignInPageContent } from "./SignInPageContent";

const METHODS = { email: true, github: false, google: false };
const USER = { id: "u1", email: "a@b.co", name: "Maya Chen", avatarUrl: null };

function renderPage(user: typeof USER | null) {
  vi.mocked(getMe).mockResolvedValue({ user, methods: METHODS });
  return render(
    <SessionProvider>
      <SignInPageContent />
    </SessionProvider>,
  );
}

async function ready() {
  await waitFor(() => expect(getMe).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.forEach((_, key) => searchParams.delete(key));
});

describe("SignInPageContent", () => {
  it("shows the sign-in form while signed out", async () => {
    renderPage(null);
    await ready();

    expect(
      await screen.findByRole("heading", { name: "Sign in to Skrivle" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("says so instead of showing the form when already signed in", async () => {
    renderPage(USER);
    await ready();

    expect(
      await screen.findByRole("heading", { name: "You're already signed in" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Maya Chen", { exact: false })).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      "/boards",
    );
  });

  it("honours ?next= for the Continue link", async () => {
    searchParams.set("next", "/board/k3m9p");
    renderPage(USER);
    await ready();

    expect(await screen.findByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      "/board/k3m9p",
    );
  });

  it("signs out from the already-signed-in state, back to the form", async () => {
    const user = userEvent.setup();
    vi.mocked(logout).mockResolvedValue(undefined);
    renderPage(USER);
    await ready();

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(
      await screen.findByRole("heading", { name: "Sign in to Skrivle" }),
    ).toBeInTheDocument();
  });
});
