import { useEffect } from "react";

import { useStore } from "@/state/store";

/** Kicks off the one CAD load for `url`; later calls win over in-flight ones. */
export function useLoadModel(url: string) {
  const loadModel = useStore((s) => s.loadModel);
  useEffect(() => {
    void loadModel(url);
  }, [loadModel, url]);
}
