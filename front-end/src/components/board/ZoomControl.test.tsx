import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createViewportStore } from "@/lib/board/viewport";
import { ZoomControl } from "./ZoomControl";

function renderControl() {
  const store = createViewportStore();
  const actions = { zoomIn: vi.fn(), zoomOut: vi.fn(), resetZoom: vi.fn(), fit: vi.fn() };
  render(<ZoomControl store={store} actions={actions} />);
  return { store, actions };
}

describe("ZoomControl", () => {
  it("reads out the zoom, and keeps up as the camera changes", () => {
    const { store } = renderControl();
    expect(screen.getByRole("button", { name: /reset zoom/i })).toHaveTextContent("100%");

    act(() => store.set({ x: 0, y: 0, scale: 0.5 }));

    expect(screen.getByRole("button", { name: /reset zoom/i })).toHaveTextContent("50%");
  });

  it("hands each button to its camera action", async () => {
    const user = userEvent.setup();
    const { actions } = renderControl();

    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    await user.click(screen.getByRole("button", { name: /reset zoom/i }));
    await user.click(screen.getByRole("button", { name: "Fit to content" }));

    expect(actions.zoomIn).toHaveBeenCalledOnce();
    expect(actions.zoomOut).toHaveBeenCalledOnce();
    expect(actions.resetZoom).toHaveBeenCalledOnce();
    expect(actions.fit).toHaveBeenCalledOnce();
  });
});
