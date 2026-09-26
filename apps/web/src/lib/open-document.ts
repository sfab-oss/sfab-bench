import { syncOpenDocument } from "@/lib/document-query";
import { viewerStore } from "@/state/viewer";
import { worldStore } from "@/state/world";

/** Open a world in this tab. Clears the CAD document. `?file=` is removed. */
export function openWorld(
  path: string,
  opts?: { history?: "push" | "replace"; force?: boolean }
) {
  viewerStore.getState().clearForDocument();
  worldStore.getState().open(path, { force: opts?.force });
  syncOpenDocument({ kind: "world", path }, opts?.history ?? "push");
}
