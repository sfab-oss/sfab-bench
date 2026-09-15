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

type EditableProbe = {
  tagName?: string;
  isContentEditable?: boolean;
  parentElement?: EditableProbe | null;
  closest?: (selector: string) => unknown;
};

export function isMacPlatform(platform: string, userAgent = ""): boolean {
  return /Mac|iPhone|iPad|iPod/.test(platform) || /Mac OS X/.test(userAgent);
}

export function filesRailShortcutLabel(mac: boolean): string {
  return mac ? "⌘B" : "Ctrl+B";
}

export function filesRailToggleTitle(mac: boolean, action: "toggle" | "show" = "toggle"): string {
  const chord = filesRailShortcutLabel(mac);
  return action === "show" ? `Show files (${chord})` : `Toggle files (${chord})`;
}

/** True when ⌘B / Ctrl+B should stay with the field (Bold in TipTap, etc.). */
export function isEditableTarget(target: unknown, activeElement: unknown = null): boolean {
  return probeIsEditable(toProbe(target)) || probeIsEditable(toProbe(activeElement));
}

function toProbe(value: unknown): EditableProbe | null {
  if (!value || typeof value !== "object") return null;
  return value as EditableProbe;
}

function probeIsEditable(probe: EditableProbe | null): boolean {
  if (!probe) return false;
  const tag = probe.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (probe.isContentEditable) return true;
  if (typeof probe.closest === "function") {
    if (probe.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) {
      return true;
    }
  }
  if (probe.parentElement) return probeIsEditable(probe.parentElement);
  return false;
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
