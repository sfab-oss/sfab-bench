/** Shared viewer context for get_viewer / catalog. Client and server both import this. */

export type ViewerTreeItem = {
  name: string;
  ref?: string;
};

export type ViewerSnapshot = {
  file: string;
  empty: boolean;
  selected: string | null;
  selectedName: string | null;
  tree: ViewerTreeItem[];
  partCount: number;
};

export type CatalogEntry = {
  path: string;
  kind: "step" | "glb";
};

export function emptySnapshot(file = ""): ViewerSnapshot {
  return {
    file,
    empty: true,
    selected: null,
    selectedName: null,
    tree: [],
    partCount: 0,
  };
}

export function catalogLabel(path: string): string {
  const name = path.split("/").filter(Boolean).pop() ?? path;
  return name.replace(/\.(step|stp|glb|gltf)$/i, "");
}

/** Immediate parent folder of the file, relative to the project. */
export function catalogFolder(path: string): string | null {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return parts[parts.length - 2]!;
}

export function catalogKindLabel(kind: CatalogEntry["kind"]): string {
  return kind === "glb" ? "GLB" : "STEP";
}

export function flattenCatalog(files: CatalogEntry[]): CatalogEntry[] {
  return [...files].sort((a, b) =>
    catalogLabel(a.path).localeCompare(catalogLabel(b.path), undefined, { sensitivity: "base" }),
  );
}

/** Recents that still exist, then the rest of the catalog A–Z (no duplicate rows). */
export function catalogSections(
  files: CatalogEntry[],
  recents: string[],
): { recents: CatalogEntry[]; rest: CatalogEntry[] } {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const recentRows: CatalogEntry[] = [];
  const seen = new Set<string>();
  for (const path of recents) {
    const hit = byPath.get(path);
    if (!hit || seen.has(path)) continue;
    recentRows.push(hit);
    seen.add(path);
  }
  return { recents: recentRows, rest: flattenCatalog(files).filter((f) => !seen.has(f.path)) };
}
