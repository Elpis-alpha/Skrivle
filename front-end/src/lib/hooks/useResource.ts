"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/errors";

export type Resource<T> =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: null; error: ApiError };

export type UseResource<T> = Resource<T> & {
  /** Re-run the loader. */
  reload: () => void;
  /** Replace the data without a round trip — for a mutation that already returned it. */
  set: (data: T) => void;
};

/**
 * Fetch-once-per-key, with cancellation. Deliberately not a cache: the three
 * things this app loads (session, one board, My Boards) are each read by one
 * screen, so a cache would be machinery without a customer.
 *
 * `load` is held in a ref refreshed every render, so the effect depends only on
 * the key — callers can pass an inline closure without memoising it.
 *
 * @param key identity of the thing being loaded; null means don't fetch.
 */
export function useResource<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
): UseResource<T> {
  const idle = <U,>(): Resource<U> => ({ status: "idle", data: null, error: null });
  const loading = <U,>(): Resource<U> => ({ status: "loading", data: null, error: null });

  const [state, setState] = useState<Resource<T>>(() =>
    key === null ? idle<T>() : loading<T>(),
  );
  const [nonce, setNonce] = useState(0);

  // Adjusting state during render when the key changes, rather than in an
  // effect: the effect version renders once with stale data before correcting
  // itself, and React supports this pattern precisely to avoid that.
  const [loadedKey, setLoadedKey] = useState(key);
  if (loadedKey !== key) {
    setLoadedKey(key);
    setState(key === null ? idle<T>() : loading<T>());
  }

  const loadRef = useRef(load);
  // Assigned in an effect rather than during render, so the render stays pure.
  // The fetching effect below is declared after this one, so it always sees
  // the current loader.
  useEffect(() => {
    loadRef.current = load;
  });

  // A generation counter as well as the AbortController: an abort only stops
  // the fetch, and a promise that already resolved can still land afterwards.
  const generation = useRef(0);

  useEffect(() => {
    if (key === null) return;

    const mine = ++generation.current;
    const controller = new AbortController();

    loadRef.current(controller.signal).then(
      (data) => {
        if (generation.current === mine) {
          setState({ status: "ready", data, error: null });
        }
      },
      (error: unknown) => {
        if (generation.current !== mine) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          status: "error",
          data: null,
          error:
            error instanceof ApiError
              ? error
              : new ApiError(0, "Something went wrong.", "Try again."),
        });
      },
    );

    return () => controller.abort();
  }, [key, nonce]);

  const reload = useCallback(() => {
    setState(loading<T>());
    setNonce((n) => n + 1);
  }, []);

  const set = useCallback(
    (data: T) => setState({ status: "ready", data, error: null }),
    [],
  );

  return { ...state, reload, set };
}
