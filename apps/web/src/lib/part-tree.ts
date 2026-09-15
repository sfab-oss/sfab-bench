export type PartTreeItem = {
  key: string;
  rawName: string;
  displayName: string;
  children: PartTreeItem[];
};

export function partQueryHits(rawName: string, displayName: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return rawName.toLowerCase().includes(q) || displayName.toLowerCase().includes(q);
}

/**
 * Keep a node if its display/raw name matches, or if any descendant does.
 * A self-hit keeps the full subtree (same as the files-rail catalog filter).
 * `expandKeys` are ancestors that must stay open so a nested hit is visible.
 */
export function filterPartTree<T extends PartTreeItem>(
  nodes: T[],
  query: string,
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
