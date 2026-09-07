import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const replace = vi.fn();
const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => "/signin",
}));

vi.mock("@/lib/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/auth")>();
  return {
    ...actual,
    requestEmailCode: vi.fn(),
    verifyEmailCode: vi.fn(),
    startOAuth: vi.fn(),
    getMe: vi.fn(),
  };
});

import { getMe, requestEmailCode, startOAuth, verifyEmailCode } from "@/lib/api/auth";
import { SignInForm } from "./SignInForm";
import { SessionProvider } from "@/lib/session/SessionProvider";

const ALL_METHODS = { email: true, github: true, google: true };

function renderForm(methods = ALL_METHODS) {
  vi.mocked(getMe).mockResolvedValue({ user: null, methods });
  return render(
    <SessionProvider>
      <SignInForm />
    </SessionProvider>,
  );
}

/** The form's OAuth row renders only once /api/auth/me has answered. */
async function ready() {
  await waitFor(() => expect(getMe).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("SignInForm", () => {
  it("advances to the code step after the request succeeds", async () => {
    const user = userEvent.setup();
    vi.mocked(requestEmailCode).mockResolvedValue({ ok: true, expiresInSeconds: 600 });
    renderForm();
    await ready();

    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.click(screen.getByRole("button", { name: "Continue with email" }));

    expect(requestEmailCode).toHaveBeenCalledWith("a@b.co");
    expect(await screen.findByLabelText("One-time code")).toBeInTheDocument();
  });

  it("rejects a malformed address without calling the API", async () => {
    const user = userEvent.setup();
    renderForm();
    await ready();

    await user.type(screen.getByLabelText("Email"), "nope");
    await user.click(screen.getByRole("button", { name: "Continue with email" }));

    expect(requestEmailCode).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Enter an email address/i,
    );
  });

  // The server's prose distinguishes expired / exhausted / mismatch and there
  // is no code field to branch on, so both halves must reach the user.
  it("shows both message and next from a failed verify", async () => {
    const user = userEvent.setup();
    vi.mocked(requestEmailCode).mockResolvedValue({ ok: true, expiresInSeconds: 600 });
    vi.mocked(verifyEmailCode).mockRejectedValue(
      new ApiError(400, "That code has expired.", "Request a new code."),
    );
    renderForm();
    await ready();

    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.click(screen.getByRole("button", { name: "Continue with email" }));
    await user.type(await screen.findByLabelText("One-time code"), "123456");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That code has expired.");
    expect(alert).toHaveTextContent("Request a new code.");
  });

  it("auto-submits once the six digits are in", async () => {
    const user = userEvent.setup();
    vi.mocked(requestEmailCode).mockResolvedValue({ ok: true, expiresInSeconds: 600 });
    vi.mocked(verifyEmailCode).mockResolvedValue({
      user: { id: "u1", email: "a@b.co", name: "A", avatarUrl: null },
    });
    renderForm();
    await ready();

    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.click(screen.getByRole("button", { name: "Continue with email" }));
    await user.type(await screen.findByLabelText("One-time code"), "123456");

    await waitFor(() => expect(verifyEmailCode).toHaveBeenCalledWith("a@b.co", "123456"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/boards"));
  });

  it("disables resend behind a countdown rather than claiming it sent", async () => {
    const user = userEvent.setup();
    vi.mocked(requestEmailCode).mockResolvedValue({ ok: true, expiresInSeconds: 600 });
    renderForm();
    await ready();

    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.click(screen.getByRole("button", { name: "Continue with email" }));
    await screen.findByLabelText("One-time code");

    const resend = screen.getByRole("button", { name: /Resend in \d+s/ });
    expect(resend).toBeDisabled();
  });

  it("honours Retry-After from a rate-limited request", async () => {
    const user = userEvent.setup();
    vi.mocked(requestEmailCode).mockRejectedValue(
      new ApiError(429, "Too many requests.", "Wait 5 minutes.", 300),
    );
    renderForm();
    await ready();

    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.click(screen.getByRole("button", { name: "Continue with email" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Too many requests.");
    expect(alert).toHaveTextContent("Wait 5 minutes.");
  });

  it("offers only the providers the server reports", async () => {
    renderForm({ email: true, github: true, google: false });
    await ready();

    expect(
      await screen.findByRole("button", { name: "Continue with GitHub" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue with Google" }),
    ).not.toBeInTheDocument();
  });

  it("navigates to the provider with the destination in tow", async () => {
    const user = userEvent.setup();
    renderForm();
    await ready();

    await user.click(
      await screen.findByRole("button", { name: "Continue with GitHub" }),
    );
    expect(startOAuth).toHaveBeenCalledWith("github", {
      returnTo: "/boards",
      claim: null,
    });
  });

  it("says so when the server has no email sign-in configured", async () => {
    renderForm({ email: false, github: true, google: false });
    await ready();

    expect(
      await screen.findByText(/Email sign-in isn't configured/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });
});
