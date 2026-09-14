import { AsyncLocalStorage } from "node:async_hooks";

import { tool } from "ai";
import { z } from "zod";

import type { ViewerSnapshot } from "@sfab-bench/contract";
import { emptySnapshot } from "@sfab-bench/contract";
import { resolveArtifact, shownUrl } from "./cad-pkg";

type ViewerStore = {
  root: string;
  file: string;
  snapshot: ViewerSnapshot;
  show: (file: string) => void;
};

const als = new AsyncLocalStorage<ViewerStore>();

export function runViewerContext<T>(store: ViewerStore, fn: () => Promise<T>) {
  return als.run(store, fn);
}

export function viewerFileUrl(path: string) {
  const root = als.getStore()?.root;
  if (!root) return { error: "no project open" };
  const resolved = resolveArtifact(path, root);
  if ("error" in resolved) return { error: resolved.error };
  return { shown: shownUrl(resolved) };
}

export const viewerTools = {
  get_viewer: tool({
    description: "What CAD artifact the visualizer is currently showing: project-relative path, empty, tree names, selected # ref.",
    inputSchema: z.object({}),
    execute: async () => {
      const store = als.getStore();
      const file = store?.file ?? "";
      const base = store?.snapshot ?? emptySnapshot(file);
      return {
        ...base,
        file: base.file || file,
        empty: base.empty || !file,
      };
    },
  }),
  show_artifact: tool({
    description: "Show a CAD artifact in the visualizer. Pass a STEP or GLB path relative to the open project folder.",
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      const resolved = viewerFileUrl(path);
      if ("error" in resolved) return resolved;
      als.getStore()?.show(resolved.shown);
      return { shown: resolved.shown };
    },
  }),
};
