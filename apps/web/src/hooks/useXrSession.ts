import { useSyncExternalStore } from "react";

import { xrStore } from "@/xrStore";

export function useXrSession() {
  return useSyncExternalStore(
    (onStoreChange) => xrStore.subscribe(onStoreChange),
    () => xrStore.getState().session,
    () => null
  );
}
