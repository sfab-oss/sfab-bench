import { syncOpenDocument } from "@/lib/document-query";
import { viewerStore } from "@/state/viewer";
import { worldStore } from "@/state/world";

/** Open a world in this tab. Clears the CAD document. `?file=` is removed. */
export function openWorld(
  path: string,
  opts?: { history?: "push" | "replace"; force?: boolean }
) {
  const carried =
    worldStore.getState().path === path
      ? worldStore.getState().selection
      : null;
  viewerStore.getState().clearForDocument();
  worldStore.getState().open(path, { force: opts?.force });
  if (carried) worldStore.getState().select(carried);
  syncOpenDocument({ kind: "world", path }, opts?.history ?? "push");
}
