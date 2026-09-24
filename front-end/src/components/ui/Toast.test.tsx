import { act, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast, type Toaster } from "./Toast";

let toast: Toaster;

beforeEach(() => {
  vi.useFakeTimers();
  toast = renderHook(() => useToast(), { wrapper: ToastProvider }).result.current;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast", () => {
  it("says what happened, politely", () => {
    act(() => toast.show("Link copied", { tone: "success" }));
    expect(screen.getByRole("status")).toHaveTextContent("Link copied");
  });

  it("goes away on its own after four seconds", () => {
    act(() => toast.show("Link copied"));
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByText("Link copied")).toBeNull();
  });

  it("shows one at a time, queueing the rest", () => {
    act(() => {
      toast.show("Link copied");
      toast.show("Title saved");
    });
    expect(screen.getByText("Link copied")).toBeInTheDocument();
    expect(screen.queryByText("Title saved")).toBeNull();

    act(() => vi.advanceTimersByTime(4000));

    expect(screen.queryByText("Link copied")).toBeNull();
    expect(screen.getByText("Title saved")).toBeInTheDocument();
  });

  it("keeps an error up until it is dismissed", () => {
    act(() => toast.show("Couldn't rename the board.", { tone: "error" }));
    act(() => vi.advanceTimersByTime(60_000));

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't rename the board.");

    act(() => screen.getByRole("button", { name: "Dismiss" }).click());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
