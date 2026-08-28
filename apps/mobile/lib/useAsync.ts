/**
 * One loading/error/data state machine for the screens.
 *
 * Four states, kept distinct because the standard requires it: loading, error,
 * empty and loaded are not variations of each other. `refreshing` is separate
 * from `loading` so a pull-to-refresh redraws in place instead of throwing the
 * screen back to a skeleton.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "./api";

export type AsyncStatus = "loading" | "error" | "ready";

export interface AsyncState<T> {
  readonly status: AsyncStatus;
  readonly data: T | null;
  readonly error: ApiError | null;
  readonly refreshing: boolean;
  reload(): void;
  refresh(): void;
}

export function useAsync<T>(
  run: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): AsyncState<T> {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    if (!refreshing) setStatus("loading");

    void (async () => {
      try {
        const result = await runRef.current(controller.signal);
        if (cancelled) return;
        setData(result);
        setError(null);
        setStatus("ready");
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError("Something went wrong.", { status: 0, code: "unknown" }),
        );
        setStatus("error");
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => {
    setNonce((value) => value + 1);
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setNonce((value) => value + 1);
  }, []);

  return { status, data, error, refreshing, reload, refresh };
}
