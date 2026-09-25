import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BoardError from "./error";

const { report } = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: report }));

beforeEach(() => report.mockClear());

const crash = new Error("Maximum update depth exceeded");

describe("the board's error page", () => {
  it("says what happened and how to carry on, without apologising", () => {
    render(<BoardError error={crash} retry={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "This board hit an error." })).toBeInTheDocument();
    expect(screen.getByText(/Reload the board to carry on/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/sorry|oops/i);
  });

  // An error boundary that catches something is the last thing to see it:
  // Next only logs it to the visitor's console.
  it("reports the error it caught", () => {
    render(<BoardError error={crash} retry={vi.fn()} />);
    expect(report).toHaveBeenCalledExactlyOnceWith(crash, "boundary");
  });

  it("reloads the board", () => {
    const retry = vi.fn();
    render(<BoardError error={crash} retry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: "Reload board" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("offers a way off the board", () => {
    render(<BoardError error={crash} retry={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  });
});
