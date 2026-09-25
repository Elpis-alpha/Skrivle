import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConnectionStatus } from "@/lib/realtime/board-session";
import { ToastProvider } from "@/components/ui/Toast";
import { ConnectionBar } from "./ConnectionBar";

const bar = (status: ConnectionStatus) => (
  <ToastProvider>
    <ConnectionBar status={status} />
  </ToastProvider>
);

describe("ConnectionBar", () => {
  it("says it's reconnecting while the socket is down", () => {
    render(bar("reconnecting"));
    expect(screen.getByText(/Reconnecting…/)).toBeInTheDocument();
  });

  // Until offline persistence lands, unsynced work lives only in this tab.
  it("doesn't claim the work is saved anywhere it isn't", () => {
    render(bar("reconnecting"));
    expect(screen.queryByText(/saved/)).toBeNull();
    expect(screen.getByText(/keep this tab open/)).toBeInTheDocument();
  });

  // §10.21 — "On recovery: toast 'Back online', bar clears."
  it("clears, and says so, when the connection comes back", () => {
    const { rerender } = render(bar("connected"));
    rerender(bar("reconnecting"));
    rerender(bar("connected"));

    expect(screen.queryByText(/Reconnecting…/)).toBeNull();
    expect(screen.getByText("Back online")).toBeInTheDocument();
  });

  it("says nothing on the first connection", () => {
    const { rerender } = render(bar("connecting"));
    rerender(bar("connected"));
    expect(screen.queryByText("Back online")).toBeNull();
  });

  // The second "connected" arrives when the server says the board is joined.
  it("says it once per recovery", () => {
    const { rerender } = render(bar("reconnecting"));
    rerender(bar("connected"));
    rerender(bar("connected"));
    expect(screen.getAllByText("Back online")).toHaveLength(1);
  });
});
