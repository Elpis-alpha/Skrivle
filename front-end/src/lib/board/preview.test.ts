import { describe, expect, it, vi } from "vitest";
import { createPreviewStore } from "./preview";

const box = { x: 1, y: 2, w: 30, h: 40 };

describe("createPreviewStore", () => {
  it("has nothing to show for an element nobody is dragging", () => {
    expect(createPreviewStore().get("a")).toBeNull();
  });

  it("hands back the box it was given", () => {
    const store = createPreviewStore();
    store.set("a", box);
    expect(store.get("a")).toEqual(box);
  });

  it("wakes only the element whose preview changed", () => {
    const store = createPreviewStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe("a", a);
    store.subscribe("b", b);

    store.set("a", box);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it("drops the preview on clear and says so", () => {
    const store = createPreviewStore();
    const listener = vi.fn();
    store.set("a", box);
    store.subscribe("a", listener);

    store.clear("a");

    expect(store.get("a")).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when clearing something that was never previewed", () => {
    const store = createPreviewStore();
    const listener = vi.fn();
    store.subscribe("a", listener);

    store.clear("a");

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", () => {
    const store = createPreviewStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe("a", listener);

    unsubscribe();
    store.set("a", box);

    expect(listener).not.toHaveBeenCalled();
  });
});
