import type { Object3D } from "three";

import type { CadReview } from "@/cad/review";

function unwrapTreeRoots(root: Object3D): Object3D[] {
  let cur = root;
  while (cur.children.length === 1) cur = cur.children[0]!;
  if (cur.children.length > 1) return [...cur.children];
  return [cur];
}

export function namedKids(obj: Object3D, review: CadReview): Object3D[] {
  return obj.children.filter(
    (child) => review.partByObject.has(child) || child.children.length > 0
  );
}

export function treeTops(review: CadReview): Object3D[] {
  const collect = (nodes: Object3D[]): Object3D[] => {
    const out: Object3D[] = [];
    for (const node of nodes) {
      if (review.partByObject.has(node)) out.push(node);
      else out.push(...collect(namedKids(node, review)));
    }
    return out;
  };
  if (review.root.userData.stepPackage) return collect(review.root.children);
  return collect(unwrapTreeRoots(review.root));
}
