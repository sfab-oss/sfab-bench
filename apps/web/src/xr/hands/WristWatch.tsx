import { Container } from "@react-three/uikit";
import { AppWindow } from "@react-three/uikit-lucide";
import { useXRInputSourceState } from "@react-three/xr";

import { useStore } from "@/state/store";
import { useXrTheme } from "@/xr/ui/theme";

/** Renders inside the left `HandRig`, so the wrist transform is already applied. */
export function WristWatch() {
  const left = useXRInputSourceState("controller", "left");
  const cardOpen = useStore((s) => s.cardOpen);
  const setCardOpen = useStore((s) => s.setCardOpen);
  const theme = useXrTheme();
  if (left || cardOpen) return null;

  return (
    <group rotation={[0, 0, -Math.PI / 2]}>
    <group position={[0, 0.015, 0.03]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh
        onClick={(ev) => {
          ev.stopPropagation();
          setCardOpen(true);
        }}
      >
        <circleGeometry args={[0.02, 28]} />
        <meshBasicMaterial color={theme.card} />
      </mesh>
      <group position={[0, 0, 0.001]} raycast={() => {}}>
        <Container pixelSize={0.0007} pointerEvents="none">
          <AppWindow width={28} height={28} color={theme.text} />
        </Container>
      </group>
    </group>
    </group>
  );
}
