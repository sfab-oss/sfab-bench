import { useEffect, useState } from "react";

export function useXrSupport() {
  const [state, setState] = useState({ ar: false, vr: false, ready: false });
  useEffect(() => {
    const xr = navigator.xr;
    if (!xr) {
      setState({ ar: false, vr: false, ready: true });
      return;
    }
    let cancelled = false;
    void Promise.all([
      xr.isSessionSupported("immersive-ar").catch(() => false),
      xr.isSessionSupported("immersive-vr").catch(() => false),
    ]).then(([ar, vr]) => {
      if (!cancelled) setState({ ar, vr, ready: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
