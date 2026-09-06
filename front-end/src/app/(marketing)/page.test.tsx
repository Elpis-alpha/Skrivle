import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Page from "./page";

// The landing page pulls in client components that route on click.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("landing page", () => {
  it("leads with the value statement as the page heading", () => {
    render(<Page />);
    expect(
      screen.getByRole("heading", { level: 1, name: /share in one link/i }),
    ).toBeInTheDocument();
  });

  it("offers the primary action", () => {
    render(<Page />);
    expect(screen.getAllByRole("button", { name: "New board" }).length).toBeGreaterThan(0);
  });

  it("lets someone join a board they already have a link to", () => {
    render(<Page />);
    expect(screen.getByLabelText(/already have a link/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
  });

  it("states the build status rather than implying the canvas ships today", () => {
    render(<Page />);
    expect(screen.getByText(/the canvas is not finished yet/i)).toBeInTheDocument();
  });

  it("answers the account question in the FAQ", () => {
    render(<Page />);
    const faq = screen.getByRole("heading", { name: "Questions" }).closest("section")!;
    expect(within(faq).getByText("Do I need an account?")).toBeInTheDocument();
  });

  // §13.5 — the page must not imply a userbase it doesn't have.
  it("claims no users, customers, or ratings", () => {
    const { container } = render(<Page />);
    const copy = container.textContent ?? "";
    expect(copy).not.toMatch(/trusted by|customers|\d[\d,]*\+? users|join \d/i);
  });
});
