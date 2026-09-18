import { useFrame } from "@react-three/fiber";
import type { VanillaContainer } from "@react-three/uikit";
import { useCallback, useRef, useState } from "react";

/** uikit pixels from the end before we treat the list as "away from latest". */
export const XR_SCROLL_EDGE = 24;
/** Right gutter so the thumb does not sit on transcript text. */
export const XR_SCROLL_GUTTER = 8;

export function xrScrollAtLiveEdge(
  maxY: number,
  y: number,
  threshold = XR_SCROLL_EDGE
) {
  if (maxY <= 0) return true;
  return maxY - y <= threshold;
}

function stickToEnd(node: VanillaContainer) {
  const maxY = node.maxScrollPosition.peek()[1] ?? 0;
  const current = node.scrollPosition.peek();
  if (Math.abs(current[1] - maxY) <= 0.5) return;
  node.scrollPosition.value = [current[0], maxY];
  node.root.peek().requestRender?.();
}

export function useXrChatScroll() {
  const ref = useRef<VanillaContainer | null>(null);
  const stick = useRef(true);
  const applying = useRef(false);
  const atEndRef = useRef(true);
  const [atEnd, setAtEnd] = useState(true);

  const setAtEndIf = useCallback((next: boolean) => {
    if (atEndRef.current === next) return;
    atEndRef.current = next;
    setAtEnd(next);
  }, []);

  const scrollToEnd = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    applying.current = true;
    stickToEnd(node);
    applying.current = false;
  }, []);

  const onScroll = useCallback(
    (_: number, y: number) => {
      if (applying.current) return;
      const node = ref.current;
      if (!node) return;
      const maxY = node.maxScrollPosition.peek()[1] ?? 0;
      const edge = xrScrollAtLiveEdge(maxY, y);
      stick.current = edge;
      setAtEndIf(edge);
    },
    [setAtEndIf]
  );

  const jumpToEnd = useCallback(() => {
    stick.current = true;
    setAtEndIf(true);
    scrollToEnd();
  }, [scrollToEnd, setAtEndIf]);

  useFrame(() => {
    const node = ref.current;
    if (!node) return;
    const dragging = node.downPointerMap.size > 0;
    if (stick.current && !dragging) {
      applying.current = true;
      stickToEnd(node);
      applying.current = false;
    }
    if (dragging) return;
    const y = node.scrollPosition.peek()[1];
    const maxY = node.maxScrollPosition.peek()[1] ?? 0;
    const edge = xrScrollAtLiveEdge(maxY, y);
    if (edge) stick.current = true;
    setAtEndIf(edge);
  });

  return { ref, atEnd, onScroll, jumpToEnd };
}
