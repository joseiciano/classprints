import { useEffect, useState } from 'react';

/**
 * Tracks `document.visibilityState` so a poll (TASK-023: processing every
 * 3000 ms) can stop while the tab is hidden, rather than burning requests a
 * teacher cannot see. Defaults to `true` outside a browser (SSR/tests).
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  );

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleChange);
    return () => document.removeEventListener('visibilitychange', handleChange);
  }, []);

  return visible;
}

/**
 * Re-renders every `intervalMs` while `enabled`, used to recompute a
 * client-derived elapsed-time display (TASK-023) without writing any timer
 * state back to the server. Returns the tick count, which callers ignore
 * except to force the re-render.
 */
export function useTicker(intervalMs: number, enabled: boolean): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setTick((value) => value + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);

  return tick;
}
