import type { CatalogEntry } from "@sfab-bench/contract";

import { shortcutTooltip } from "./shortcuts";

export const FILE_TREE_EXPANSION_KEY = "sfab-bench.file-tree-expansion";

export type CatalogKindFilter = "all" | "step" | "glb";

/** CAD screens never list a firmware image. Device screens list only those. */
export function cadCatalog(files: CatalogEntry[]): CatalogEntry[] {
  return files.filter((file) => file.kind !== "firmware");
}

export function deviceCatalog(files: CatalogEntry[]): CatalogEntry[] {
  return files.filter((file) => file.kind === "firmware");
}

export type CatalogEmptyReason =
  | { type: "ready" }
  | { type: "no-cad" }
  | { type: "kind"; kind: "step" | "glb" }
  | { type: "search" };

export function filesRailToggleTitle(
  mac: boolean,
  action: "toggle" | "show" = "toggle"
): string {
  return action === "show"
    ? shortcutTooltip("Show files", "toggle-files", mac)
    : shortcutTooltip("Toggle files", "toggle-files", mac);
}

export function catalogEmptyReason(input: {
  fileCount: number;
  listedCount: number;
  treeCount: number;
  kind: CatalogKindFilter;
}): CatalogEmptyReason {
  if (input.fileCount === 0) return { type: "no-cad" };
  if (input.listedCount === 0 && input.kind !== "all")
    return { type: "kind", kind: input.kind };
  if (input.treeCount === 0) return { type: "search" };
  return { type: "ready" };
}

/** Re-clicking the open file is a no-op unless that load already failed. */
export function shouldReloadOpenFile(
  path: string,
  current: string,
  hasError: boolean
): boolean {
  if (path !== current) return true;
  return hasError;
}

export function readFileTreeExpansion(
  raw: string | null
): Record<string, string[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const rec = parsed as Record<string, unknown>;
    if (Array.isArray(rec.projects)) {
      const out: Record<string, string[]> = {};
      for (const row of rec.projects) {
        if (!row || typeof row !== "object") continue;
        const item = row as Record<string, unknown>;
        if (typeof item.path !== "string" || item.path.length === 0) continue;
        if (!Array.isArray(item.expanded)) continue;
        out[item.path] = unique(
          item.expanded.filter(
            (path): path is string => typeof path === "string"
          )
        );
      }
      return out;
    }
    const out: Record<string, string[]> = {};
    for (const [path, expanded] of Object.entries(rec)) {
      if (!Array.isArray(expanded)) continue;
      out[path] = unique(
        expanded.filter((item): item is string => typeof item === "string")
      );
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeFileTreeExpansion(
  projects: Record<string, string[]>
): string {
  return JSON.stringify(projects);
}

export function loadFileTreeExpansion(): Record<string, string[]> {
  if (typeof localStorage === "undefined") return {};
  try {
    return readFileTreeExpansion(localStorage.getItem(FILE_TREE_EXPANSION_KEY));
  } catch {
    return {};
  }
}

export function saveFileTreeExpansion(
  projects: Record<string, string[]>
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      FILE_TREE_EXPANSION_KEY,
      serializeFileTreeExpansion(projects)
    );
  } catch {
    /* quota / private mode */
  }
}

/** `null` means this project has never been stored; `[]` is collapse-all. */
export function loadExpandedDirs(projectPath: string): string[] | null {
  const all = loadFileTreeExpansion();
  return Object.hasOwn(all, projectPath) ? all[projectPath]! : null;
}

export function saveExpandedDirs(
  projectPath: string,
  expanded: string[]
): void {
  const all = loadFileTreeExpansion();
  all[projectPath] = unique(expanded);
  saveFileTreeExpansion(all);
}

function unique(paths: string[]): string[] {
  return [...new Set(paths)];
}
