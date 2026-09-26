import { useEffect } from "react";

import { useViewer } from "@/state/viewer";

/** Kicks off the one CAD load for `url`; later calls win over in-flight ones. */
export function useLoadModel(url: string) {
  const loadModel = useViewer((s) => s.loadModel);
  useEffect(() => {
    void loadModel(url);
  }, [loadModel, url]);
}
