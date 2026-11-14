import { useEffect, useRef } from 'react';

/** Runs `fn(dtMs)` every animation frame while `active` is true. */
export function useRaf(active: boolean, fn: (dt: number) => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      fnRef.current(Math.min(50, now - last));
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}

export const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
