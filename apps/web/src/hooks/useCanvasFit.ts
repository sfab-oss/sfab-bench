import { useLayoutEffect, useRef, useState } from "react";
import type { Object3D, Vector3 } from "three";

import type { CadReview } from "@/cad/review";
import { homeFitDirection } from "@/cad/review";
import { fitCardsReady, fitInsets, setLiveFitInsets } from "@/lib/layout";
import { invalidateSceneNow } from "@/scene/invalidate";

function useOverlayCardHeight(): [number, (el: HTMLElement | null) => void] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    if (!el) {
      setHeight(0);
      return;
    }
    const read = () => setHeight(Math.round(el.getBoundingClientRect().height));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [height, setEl];
}

/** Publish overlay insets and one-shot Home after a load once the cards are measured. */
export function useCanvasFit(input: {
  xrActive: boolean;
  review: CadReview | null;
  url: string;
  fit: ((obj: Object3D, dir?: Vector3) => void) | null;
  cameraMoved: boolean;
  canvasWidth: number;
  canvasHeight: number;
  partsExpanded: boolean;
  partsChip: boolean;
  detailVisible: boolean;
  detailWidth: number;
}): {
  setPartsCard: (el: HTMLElement | null) => void;
  setDetailCard: (el: HTMLElement | null) => void;
} {
  const {
    xrActive,
    review,
    url,
    fit,
    cameraMoved,
    canvasWidth,
    canvasHeight,
    partsExpanded,
    partsChip,
    detailVisible,
    detailWidth,
  } = input;
  const settledFitUrl = useRef<string | null>(null);
  const [partsHeight, setPartsCard] = useOverlayCardHeight();
  const [detailHeight, setDetailCard] = useOverlayCardHeight();

  useLayoutEffect(() => {
    if (xrActive) {
      setLiveFitInsets({ left: 0, right: 0, top: 0, bottom: 0 });
      return;
    }
    setLiveFitInsets(
      fitInsets({
        partsExpanded,
        partsChip,
        detailVisible,
        detailWidth,
        partsHeight,
        detailHeight,
        canvasWidth,
        canvasHeight,
      }),
    );
    if (!review) {
      settledFitUrl.current = null;
      return;
    }
    if (cameraMoved || canvasWidth < 2 || canvasHeight < 2 || !fit) return;
    if (settledFitUrl.current === url) return;
    if (
      !fitCardsReady({
        partsExpanded,
        partsChip,
        detailVisible,
        partsHeight,
        detailHeight,
      })
    ) {
      return;
    }
    fit(review.root, homeFitDirection());
    settledFitUrl.current = url;
    invalidateSceneNow();
  }, [
    xrActive,
    partsExpanded,
    partsChip,
    detailVisible,
    detailWidth,
    partsHeight,
    detailHeight,
    review,
    cameraMoved,
    canvasWidth,
    canvasHeight,
    fit,
    url,
  ]);

  return { setPartsCard, setDetailCard };
}
