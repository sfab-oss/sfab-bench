import { useEffect, useState } from "react";

import {
  MOTION_READY_ATTR,
  MOTION_READY_VALUE,
  REDUCED_MOTION_QUERY,
  firstPaintSuppressed,
  prefersReducedMotion,
} from "@/lib/motion";

function readReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Hold CSS transitions until two frames after this surface painted. */
export function useMotionReady(navigationKey: string): boolean {
  const [paintedKey, setPaintedKey] = useState<string | null>(null);
  const held = firstPaintSuppressed(paintedKey, navigationKey);

  useEffect(() => {
    const root = document.documentElement;
    root.removeAttribute(MOTION_READY_ATTR);
    let releaseFrame = 0;
    const paintFrame = window.requestAnimationFrame(() => {
      releaseFrame = window.requestAnimationFrame(() => {
        setPaintedKey(navigationKey);
        root.setAttribute(MOTION_READY_ATTR, MOTION_READY_VALUE);
      });
    });
    return () => {
      window.cancelAnimationFrame(paintFrame);
      window.cancelAnimationFrame(releaseFrame);
    };
  }, [navigationKey]);

  return held;
}

export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(readReducedMotion);

  useEffect(() => {
    const mq = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setReduce(prefersReducedMotion(mq.matches));
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduce;
}
