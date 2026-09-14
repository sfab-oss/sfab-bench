import { treeTops } from "@/cad/tree";
import type { ViewerSnapshot } from "@/lib/viewer-snapshot";
import { emptySnapshot } from "@/lib/viewer-snapshot";
import { store } from "@/state/store";

export function viewerSnapshot(): ViewerSnapshot {
  const s = store.getState();
  const file = s.url;
  if (!file || !s.review) return emptySnapshot(file);
  const review = s.review;
  const part = s.selectedId !== null ? review.parts[s.selectedId] : undefined;
  const tree = treeTops(review).map((obj) => {
    const item = review.partByObject.get(obj);
    return { name: item?.name ?? obj.name, ref: item?.cadRef };
  });
  return {
    file,
    empty: false,
    selected: s.pickedRef ?? part?.cadRef ?? null,
    selectedName: part?.name ?? null,
    tree,
    partCount: review.parts.length,
  };
}
