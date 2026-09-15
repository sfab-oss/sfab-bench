import { formatShortcut, shortcutTooltip } from "./shortcuts";

export { isEditableTarget, isMacPlatform } from "./shortcuts";

export const FILE_TREE_EXPANSION_KEY = "sfab-bench.file-tree-expansion";
export const FILE_TREE_EXPANSION_MAX = 20;

export type CatalogKindFilter = "all" | "step" | "glb";

export type CatalogEmptyReason =
  | { type: "ready" }
  | { type: "no-cad" }
  | { type: "kind"; kind: "step" | "glb" }
  | { type: "search" };

export type FileTreeProjectExpansion = {
  path: string;
  expanded: string[];
  seen: string[];
  updatedAt: number;
};

export function filesRailShortcutLabel(mac: boolean): string {
  return formatShortcut("toggle-files", mac);
}

export function filesRailToggleTitle(mac: boolean, action: "toggle" | "show" = "toggle"): string {
  return action === "show" ? shortcutTooltip("Show files", "toggle-files", mac) : shortcutTooltip("Toggle files", "toggle-files", mac);
}

/** Matches `w-48` plus one menu row (`p-1` + `py-1.5`). */
export const FILE_CONTEXT_MENU_WIDTH = 192;
export const FILE_CONTEXT_MENU_HEIGHT = 44;
export const FILE_CONTEXT_MENU_MARGIN = 8;

/** Keep a fixed context menu inside the viewport. */
export function clampContextMenuPosition(
  x: number,
  y: number,
  viewport: { width: number; height: number },
  size: { width: number; height: number } = {
    width: FILE_CONTEXT_MENU_WIDTH,
    height: FILE_CONTEXT_MENU_HEIGHT,
  },
  margin = FILE_CONTEXT_MENU_MARGIN,
): { left: number; top: number } {
  const maxLeft = Math.max(margin, viewport.width - size.width - margin);
  const maxTop = Math.max(margin, viewport.height - size.height - margin);
  return {
    left: Math.min(Math.max(x, margin), maxLeft),
    top: Math.min(Math.max(y, margin), maxTop),
  };
}

export function catalogEmptyReason(input: {
  fileCount: number;
  listedCount: number;
  treeCount: number;
  kind: CatalogKindFilter;
}): CatalogEmptyReason {
  if (input.fileCount === 0) return { type: "no-cad" };
  if (input.listedCount === 0 && input.kind !== "all") return { type: "kind", kind: input.kind };
  if (input.treeCount === 0) return { type: "search" };
  return { type: "ready" };
}

/** Re-clicking the open file is a no-op unless that load already failed. */
export function shouldReloadOpenFile(path: string, current: string, hasError: boolean): boolean {
  if (path !== current) return true;
  return hasError;
}

export function defaultExpandedDirPaths(topLevelDirPaths: string[], ancestorPaths: string[]): string[] {
  return unique([...topLevelDirPaths, ...ancestorPaths]);
}

export type FileTreeRevealKey = {
  current: string;
  filter: string;
  kind: CatalogKindFilter;
};

/** Polls reuse the same key; only a real file / filter change should un-collapse. */
export function shouldRevealAncestors(prev: FileTreeRevealKey, next: FileTreeRevealKey): boolean {
  return prev.current !== next.current || prev.filter !== next.filter || prev.kind !== next.kind;
}

export function withRevealedDirs(expanded: string[], extra: string[]): { dirs: string[]; changed: boolean } {
  const next = new Set(expanded);
  let changed = false;
  for (const path of extra) {
    if (!next.has(path)) {
      next.add(path);
      changed = true;
    }
  }
  return { dirs: changed ? [...next] : expanded, changed };
}

export function pruneFileTreeProjects(
  projects: FileTreeProjectExpansion[],
  max = FILE_TREE_EXPANSION_MAX,
): FileTreeProjectExpansion[] {
  return [...projects]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(0, max));
}

export function upsertFileTreeProject(
  projects: FileTreeProjectExpansion[],
  next: FileTreeProjectExpansion,
  max = FILE_TREE_EXPANSION_MAX,
): FileTreeProjectExpansion[] {
  return pruneFileTreeProjects(
    [next, ...projects.filter((row) => row.path !== next.path)],
    max,
  );
}

export function findFileTreeProject(
  projects: FileTreeProjectExpansion[],
  path: string,
): FileTreeProjectExpansion | undefined {
  return projects.find((row) => row.path === path);
}

/**
 * First visit uses today's seed (depth-1 dirs + ancestors). After that,
 * stored expand/collapse wins; dirs never seen before still get the seed.
 */
export function resolvedExpandedDirs(
  stored: FileTreeProjectExpansion | undefined,
  defaultExpanded: string[],
  allDirs: string[],
): string[] {
  if (!stored) return unique(defaultExpanded);
  const seen = new Set(stored.seen);
  const expanded = new Set(stored.expanded.filter((path) => allDirs.includes(path)));
  for (const dir of allDirs) {
    if (!seen.has(dir) && defaultExpanded.includes(dir)) expanded.add(dir);
  }
  return [...expanded];
}

export function readFileTreeExpansion(raw: string | null): FileTreeProjectExpansion[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { projects?: unknown };
    if (!Array.isArray(parsed.projects)) return [];
    const rows: FileTreeProjectExpansion[] = [];
    for (const row of parsed.projects) {
      const next = parseProject(row);
      if (next) rows.push(next);
    }
    return rows;
  } catch {
    return [];
  }
}

export function serializeFileTreeExpansion(projects: FileTreeProjectExpansion[]): string {
  return JSON.stringify({ projects: pruneFileTreeProjects(projects) });
}

export function loadFileTreeProjects(): FileTreeProjectExpansion[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return readFileTreeExpansion(localStorage.getItem(FILE_TREE_EXPANSION_KEY));
  } catch {
    return [];
  }
}

export function saveFileTreeProjects(projects: FileTreeProjectExpansion[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(FILE_TREE_EXPANSION_KEY, serializeFileTreeExpansion(projects));
  } catch {
    /* quota / private mode */
  }
}

function parseProject(row: unknown): FileTreeProjectExpansion | null {
  if (!row || typeof row !== "object") return null;
  const rec = row as Record<string, unknown>;
  if (typeof rec.path !== "string" || rec.path.length === 0) return null;
  if (!Array.isArray(rec.expanded) || !Array.isArray(rec.seen)) return null;
  const expanded = rec.expanded.filter((path): path is string => typeof path === "string");
  const seen = rec.seen.filter((path): path is string => typeof path === "string");
  const updatedAt = typeof rec.updatedAt === "number" && Number.isFinite(rec.updatedAt) ? rec.updatedAt : 0;
  return { path: rec.path, expanded, seen, updatedAt };
}

function unique(paths: string[]): string[] {
  return [...new Set(paths)];
}
