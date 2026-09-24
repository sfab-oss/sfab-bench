import { useEffect, useState } from "react";

import { SOURCE_QUERY_EVENT, sourceUrl } from "@/lib/source-query";

export function useSourcePath(): string {
  const [path, setPath] = useState(sourceUrl);
  useEffect(() => {
    const sync = () => setPath(sourceUrl());
    window.addEventListener("popstate", sync);
    window.addEventListener(SOURCE_QUERY_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(SOURCE_QUERY_EVENT, sync);
    };
  }, []);
  return path;
}
