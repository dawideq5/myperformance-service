"use client";

import { useCallback, useRef, useState } from "react";

export interface UseAsyncActionState<TResult> {
  pending: boolean;
  error: string | null;
  data: TResult | null;
}

export interface UseAsyncActionResult<TArgs extends unknown[], TResult>
  extends UseAsyncActionState<TResult> {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  reset: () => void;
  setError: (error: string | null) => void;
}

/**
 * Lightweight mutation hook. Tracks pending/error/data for a single async action
 * and swallows results from stale calls after unmount. Prefer this over rolling
 * per-component useState triples.
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: {
    resolveError?: (err: unknown) => string;
    onSuccess?: (result: TResult) => void;
    onError?: (err: unknown) => void;
  } = {},
): UseAsyncActionResult<TArgs, TResult> {
  const { resolveError = defaultResolveError, onSuccess, onError } = options;
  const [state, setState] = useState<UseAsyncActionState<TResult>>({
    pending: false,
    error: null,
    data: null,
  });
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);

  const run = useCallback(
    async (...args: TArgs) => {
      const id = ++runIdRef.current;
      setState((prev) => ({ ...prev, pending: true, error: null }));
      try {
        const result = await fn(...args);
        if (!mountedRef.current || runIdRef.current !== id) return result;
        setState({ pending: false, error: null, data: result });
        onSuccess?.(result);
        return result;
      } catch (err) {
        if (!mountedRef.current || runIdRef.current !== id) return;
        const message = resolveError(err);
        setState({ pending: false, error: message, data: null });
        onError?.(err);
        return undefined;
      }
    },
    [fn, resolveError, onSuccess, onError],
  );

  const reset = useCallback(() => {
    runIdRef.current++;
    setState({ pending: false, error: null, data: null });
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  return { ...state, run, reset, setError };
}

function defaultResolveError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return "Wystąpił nieoczekiwany błąd";
}
