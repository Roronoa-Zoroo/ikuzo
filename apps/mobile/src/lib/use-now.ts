import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

/** Current time, re-rendering every `intervalMs` so countdowns stay live. */
export const useNow = (intervalMs = MINUTE_MS): number => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
};
