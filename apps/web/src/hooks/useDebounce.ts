import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Returns a debounced version of the provided value.
 * The returned value only updates after the specified delay
 * has elapsed since the last change.
 *
 * @param value - The value to debounce
 * @param delayMs - Debounce delay in milliseconds (default: 300)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

/**
 * Returns a debounced callback that delays invoking the provided
 * function until after `delayMs` milliseconds have elapsed since
 * the last invocation. The pending invocation can be cancelled
 * via the returned `cancel` method, or flushed immediately via `flush`.
 *
 * @param callback - Function to debounce
 * @param delayMs - Debounce delay in milliseconds (default: 300)
 * @returns Object with `run`, `cancel`, and `flush` methods
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs = 300,
): { run: (...args: Args) => void; cancel: () => void; flush: () => void } {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<Args | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingArgsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current !== null && pendingArgsRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      callbackRef.current(...pendingArgsRef.current);
      pendingArgsRef.current = null;
    }
  }, []);

  const run = useCallback(
    (...args: Args) => {
      pendingArgsRef.current = args;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (pendingArgsRef.current !== null) {
          callbackRef.current(...pendingArgsRef.current);
          pendingArgsRef.current = null;
        }
      }, delayMs);
    },
    [delayMs],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { run, cancel, flush };
}
