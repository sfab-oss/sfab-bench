import { Container, Text } from "@react-three/uikit";
import { useXRInputSourceState } from "@react-three/xr";
import { createContext, useContext, useMemo, useRef, useState, type ComponentType } from "react";

import { pulseClick, pulseHover } from "@/xr/haptics";

export type Feedback = {
  /** Called on hover enter/leave; pulses once per distinct button entered. */
  hover: (key: string, hovered: boolean) => void;
  /** Called on click; a firmer pulse than hover. */
  click: () => void;
};

export const FeedbackContext = createContext<Feedback>({ hover: () => {}, click: () => {} });

/** Delay before a hovered button shows its tooltip. */
const TIP_DELAY_MS = 450;

/** Pressed-frame colours for the light buttons; uikit applies them while a button is down. */
export const PRESSED = { backgroundColor: "#bfdbfe" } as const;

/** Haptic feedback bound to one input source (a no-op for hands, which have no actuator). */
export function useFeedback(source: XRInputSource | undefined): Feedback {
  const last = useRef<string | null>(null);
  const ref = useRef(source);
  ref.current = source;
  return useMemo(
    () => ({
      hover: (key, hovered) => {
        if (!hovered) {
          if (last.current === key) last.current = null;
          return;
        }
        if (last.current === key) return;
        last.current = key;
        pulseHover(ref.current);
      },
      click: () => pulseClick(ref.current),
    }),
    [],
  );
}

/** Feedback for the right controller, which owns the ray in controller mode. */
export function useRightControllerFeedback(): Feedback {
  const right = useXRInputSourceState("controller", "right");
  return useFeedback(right?.inputSource);
}

type Icon = ComponentType<{ width?: number; height?: number; color?: string }>;

export function ToolBtn({
  id,
  icon: Icon,
  label,
  tip,
  onClick,
  active,
  grow = true,
  round = false,
  onHover,
  backgroundColor = "#f4f4f5",
  hoverColor = "#e4e4e7",
}: {
  id: string;
  icon?: Icon;
  label?: string;
  tip?: string;
  onClick: () => void;
  active?: boolean;
  grow?: boolean;
  round?: boolean;
  onHover?: (hovered: boolean) => void;
  backgroundColor?: string;
  hoverColor?: string;
}) {
  const feedback = useContext(FeedbackContext);
  const [tipShown, setTipShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTip = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setTipShown(false);
  };
  return (
    <Container
      flexGrow={grow ? 1 : 0}
      flexShrink={0}
      width={grow ? undefined : round ? 18 : 32}
      height={round ? 18 : 32}
      alignItems="center"
      justifyContent="center"
      borderRadius={round ? 9 : 6}
      backgroundColor={active ? "#dbeafe" : backgroundColor}
      hover={{ backgroundColor: hoverColor }}
      active={PRESSED}
      onClick={() => {
        clearTip();
        feedback.click();
        onClick();
      }}
      onHoverChange={(hovered) => {
        feedback.hover(id, hovered);
        onHover?.(hovered);
        if (!tip) return;
        if (hovered) {
          timer.current = setTimeout(() => setTipShown(true), TIP_DELAY_MS);
        } else {
          clearTip();
        }
      }}
    >
      {Icon ? (
        <Icon width={round ? 12 : 16} height={round ? 12 : 16} color="#18181b" />
      ) : (
        <Text fontSize={14} color="#18181b">
          {label}
        </Text>
      )}
      {tip && tipShown ? (
        // Tooltip floats above the button, centred on it. The outer strip spans
        // the button width; the pill inside may be wider and overflows evenly.
        <Container
          positionType="absolute"
          positionBottom="100%"
          positionLeft={0}
          positionRight={0}
          marginBottom={6}
          alignItems="center"
          pointerEvents="none"
          zIndexOffset={10}
        >
          <Container
            flexShrink={0}
            paddingX={8}
            paddingY={4}
            borderRadius={6}
            backgroundColor="#18181b"
          >
            <Text fontSize={11} color="#fafafa" whiteSpace="pre">
              {tip}
            </Text>
          </Container>
        </Container>
      ) : null}
    </Container>
  );
}
