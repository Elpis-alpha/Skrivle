import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useResource } from "./useResource";

describe("useResource", () => {
  // Two mutations landing close together must both stick: each applies to
  // what the other left, not to the data as it was when it started.
  it("applies each update to the latest data", async () => {
    const { result } = renderHook(() => useResource("k", async () => [1]));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => {
      result.current.update((list) => [...list, 2]);
      result.current.update((list) => [...list, 3]);
    });

    expect(result.current.data).toEqual([1, 2, 3]);
  });

  it("leaves a resource that hasn't loaded alone", () => {
    const { result } = renderHook(() =>
      useResource<number[]>("k", () => new Promise(() => {})),
    );

    act(() => result.current.update((list) => [...list, 2]));

    expect(result.current.status).toBe("loading");
  });
});
