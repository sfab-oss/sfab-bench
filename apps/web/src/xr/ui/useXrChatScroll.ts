import { useFrame } from "@react-three/fiber";
import type { VanillaContainer } from "@react-three/uikit";
import { useCallback, useRef, useState } from "react";

/** uikit pixels from the end before we treat the list as "away from latest". */
const EDGE = 24;

export function useXrChatScroll() {
  const ref = useRef<VanillaContainer | null>(null);
  const stick = useRef(true);
  const applying = useRef(false);
  const [atEnd, setAtEnd] = useState(true);

  const scrollToEnd = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const maxY = node.maxScrollPosition.value[1] ?? 0;
    const [x, y] = node.scrollPosition.value;
    if (Math.abs((y ?? 0) - maxY) < 0.5) return;
    applying.current = true;
    node.scrollPosition.value = [x, maxY];
    applying.current = false;
  }, []);

  const onScroll = useCallback((_: number, y: number) => {
    if (applying.current) return;
    const maxY = ref.current?.maxScrollPosition.value[1] ?? 0;
    const nearEnd = maxY - y <= EDGE;
    stick.current = nearEnd;
    setAtEnd(nearEnd);
  }, []);

  const jumpToEnd = useCallback(() => {
    stick.current = true;
    setAtEnd(true);
    scrollToEnd();
  }, [scrollToEnd]);

  useFrame(() => {
    if (stick.current) scrollToEnd();
  });

  return { ref, atEnd, onScroll, jumpToEnd };
}
