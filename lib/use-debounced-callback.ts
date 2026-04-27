"use client";

import { useEffect, useRef } from "react";

/**
 * Returns a stable, trailing-debounced wrapper around `fn`. The
 * callback fires `delayMs` after the LAST call, swallowing any
 * intermediate calls inside that window. Cleans up its pending
 * timer on unmount.
 *
 * Designed for the "realtime fan-out → router.refresh()" pattern
 * where N rapid updates within ~200ms (e.g. an organizer scoring
 * several courts in quick succession) would otherwise queue up
 * as N separate page-level refetches. Coalescing them into a
 * single trailing refresh saves the duplicate work without
 * losing any data — the refresh always runs at least once after
 * the last burst event.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number
): (...args: Args) => void {
  // Stash the latest function in a ref so the returned callback
  // identity stays stable for useEffect dep arrays.
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return (...args: Args) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      fnRef.current(...args);
    }, delayMs);
  };
}
