import { useEffect, useRef } from "react";

/**
 * Like setInterval, but pauses when document is hidden (saves battery/bandwidth).
 */
export function useVisibleInterval(callback: () => void, delayMs: number, deps: any[] = []) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (id) return;
      id = setInterval(() => savedCallback.current(), delayMs);
    }

    function stop() {
      if (id) { clearInterval(id); id = null; }
    }

    function onVisibility() {
      if (document.hidden) stop(); else start();
    }

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [delayMs, ...deps]);
}
