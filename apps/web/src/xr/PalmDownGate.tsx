import { useFrame } from "@react-three/fiber";
import { useRef, useState, type ReactNode } from "react";
import type { Object3D } from "three";

import { wristObject } from "@/xr/hands/HandRig";

/** Wrist-mounted panel that shows only while the back of the hand faces up. */
export function PalmDownGate({
  position,
  rotation,
  hidden,
  children,
  hand,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  hidden: boolean;
  children: ReactNode;
  /** If set, gate on this wrist even when nested in extra offset groups. */
  hand?: "left" | "right";
}) {
  const root = useRef<Object3D>(null);
  const shown = useRef(true);
  const [show, setShow] = useState(true);
  useFrame(() => {
    const wrist = hand ? wristObject(hand) : root.current?.parent;
    if (!wrist) return;
    wrist.updateWorldMatrix(true, false);
    const dorsalUp = wrist.matrixWorld.elements[5];
    const next = shown.current ? dorsalUp > 0.15 : dorsalUp > 0.4;
    if (next === shown.current) return;
    shown.current = next;
    setShow(next);
  });
  return (
    <group ref={root} position={position} rotation={rotation} visible={show && !hidden}>
      {children}
    </group>
  );
}
