import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Returns a throttled version of the provided value.
 * Updates at most once per `intervalMs` milliseconds.
 *
 * @param value - The value to throttle
 * @param intervalMs - Throttle interval in milliseconds (default: 200)
 * @returns The throttled value
 */
export function useThrottle<T>(value: T, intervalMs = 200): T {
  const [throttled, setThrottled] = useState<T>(value);
  const lastUpdated = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdated.current;

    if (elapsed >= intervalMs) {
      setThrottled(value);
      lastUpdated.current = now;
    } else {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setThrottled(value);
        lastUpdated.current = Date.now();
        timerRef.current = null;
      }, intervalMs - elapsed);
    }

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [value, intervalMs]);

  return throttled;
}

/**
 * Returns a throttled callback that invokes the provided function
 * at most once per `intervalMs` milliseconds (leading edge).
 * Trailing calls are captured and fired after the interval expires.
 *
 * @param callback - Function to throttle
 * @param intervalMs - Throttle interval in milliseconds (default: 200)
 * @returns Object with `run` and `cancel` methods
 */
export function useThrottledCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  intervalMs = 200,
): { run: (...args: Args) => void; cancel: () => void } {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const lastInvokedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<Args | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingArgsRef.current = null;
  }, []);

  const run = useCallback(
    (...args: Args) => {
      const now = Date.now();
      const elapsed = now - lastInvokedRef.current;

      if (elapsed >= intervalMs) {
        lastInvokedRef.current = now;
        callbackRef.current(...args);
      } else {
        pendingArgsRef.current = args;
        if (timerRef.current === null) {
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            lastInvokedRef.current = Date.now();
            if (pendingArgsRef.current !== null) {
              callbackRef.current(...pendingArgsRef.current);
              pendingArgsRef.current = null;
            }
          }, intervalMs - elapsed);
        }
      }
    },
    [intervalMs],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { run, cancel };
}
