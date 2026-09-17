import { Line } from "@react-three/drei";
import { useShallow } from "zustand/react/shallow";

import { useStore } from "@/state/store";

const AIR = "#a1a1aa";
const ON_FACE = "#2563eb";
const DRAFT = "#38bdf8";

export function SketchOverlay() {
  const { sketches, draft } = useStore(
    useShallow((s) => ({ sketches: s.sketches, draft: s.draft }))
  );
  const items = draft ? [...sketches, draft] : sketches;
  return (
    <group>
      {items.map((stroke) =>
        stroke.points.length >= 2 ? (
          <Line
            key={stroke.id}
            points={stroke.points}
            color={stroke === draft ? DRAFT : stroke.on ? ON_FACE : AIR}
            lineWidth={2}
            depthTest={false}
          />
        ) : null
      )}
    </group>
  );
}
