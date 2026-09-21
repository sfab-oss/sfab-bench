import { useEffect, useState } from "react";

import { DEVICE_QUERY_EVENT, deviceUrl } from "@/lib/device-query";

export function useDevicePath(): string {
  const [path, setPath] = useState(deviceUrl);
  useEffect(() => {
    const sync = () => setPath(deviceUrl());
    window.addEventListener("popstate", sync);
    window.addEventListener(DEVICE_QUERY_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(DEVICE_QUERY_EVENT, sync);
    };
  }, []);
  return path;
}
