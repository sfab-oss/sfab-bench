import { useEffect, useState } from "react";

import { shouldForceIwerOnThisPage } from "@/xr/devIwer";

const RETRY_MS = 150;
const RETRY_MAX = 20;

export function useXrSupport() {
  const [state, setState] = useState({ ar: false, vr: false, ready: false });
  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const retry =
      typeof window !== "undefined" &&
      shouldForceIwerOnThisPage(window.location.hostname, import.meta.env.DEV);

    const tick = () => {
      const xr = navigator.xr;
      if (!xr) {
        if (!cancelled) setState({ ar: false, vr: false, ready: true });
        if (retry && tries < RETRY_MAX) {
          tries += 1;
          timeout = setTimeout(tick, RETRY_MS);
        }
        return;
      }
      void Promise.all([
        xr.isSessionSupported("immersive-ar").catch(() => false),
        xr.isSessionSupported("immersive-vr").catch(() => false),
      ]).then(([ar, vr]) => {
        if (cancelled) return;
        setState({ ar, vr, ready: true });
        if (retry && !ar && !vr && tries < RETRY_MAX) {
          tries += 1;
          timeout = setTimeout(tick, RETRY_MS);
        }
      });
    };
    tick();
    return () => {
      cancelled = true;
      if (timeout !== undefined) clearTimeout(timeout);
    };
  }, []);
  return state;
}
