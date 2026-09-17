import type { Object3D } from "three";

import type { CadReview } from "@/cad/review";
import { namedKids, treeTops } from "@/cad/tree";

export type PartTreeItem = {
  key: string;
  rawName: string;
  displayName: string;
  children: PartTreeItem[];
};

function hoistUnnamed(objs: Object3D[], review: CadReview): Object3D[] {
  const out: Object3D[] = [];
  for (const obj of objs) {
    if (review.partByObject.has(obj)) out.push(obj);
    else out.push(...hoistUnnamed(namedKids(obj, review), review));
  }
  return out;
}

/**
 * Part children of `parent`, hoisting unnamed GLB wrappers so the model tree
 * and Selection panel share the same `(1.2)` suffixes.
 */
export function siblingRows(
  review: CadReview,
  parent: Object3D | null | undefined
): Object3D[] {
  let level = parent ?? null;
  while (level && !review.partByObject.has(level) && level !== review.root) {
    const up = level.parent;
    if (!up) break;
    level = up;
  }
  if (!level || level === review.root)
    return hoistUnnamed(treeTops(review), review);
  return hoistUnnamed(namedKids(level, review), review);
}

export function partQueryHits(
  rawName: string,
  displayName: string,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    rawName.toLowerCase().includes(q) || displayName.toLowerCase().includes(q)
  );
}

/**
 * Keep a node if its display/raw name matches, or if any descendant does.
 * A self-hit keeps the full subtree (same as the files-rail catalog filter).
 * `expandKeys` are ancestors that must stay open so a nested hit is visible.
 */
export function filterPartTree<T extends PartTreeItem>(
  nodes: T[],
  query: string
): { nodes: T[]; expandKeys: string[] } {
  const q = query.trim();
  if (!q) return { nodes, expandKeys: [] };
  const expandKeys: string[] = [];

  const walk = (list: T[]): T[] => {
    const out: T[] = [];
    for (const node of list) {
      const selfHit = partQueryHits(node.rawName, node.displayName, q);
      if (selfHit) {
        if (node.children.length) expandKeys.push(node.key);
        out.push(node);
        continue;
      }
      const children = walk(node.children as T[]);
      if (children.length) {
        expandKeys.push(node.key);
        out.push({ ...node, children });
      }
    }
    return out;
  };

  return { nodes: walk(nodes), expandKeys };
}
