import { Billboard, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Container, Text } from "@react-three/uikit";
import { useRef } from "react";
import type { Object3D } from "three";
import * as THREE from "three";

import { formatMm, measureDelta } from "@/lib/measure";
import { useStore } from "@/state/store";

const parentScale = new THREE.Vector3();

export function pinWorldSize(obj: Object3D) {
  const parent = obj.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  parent.getWorldScale(parentScale);
  const s = Math.max(parentScale.x, 1e-6);
  obj.scale.setScalar(1 / s);
}

export function MeasureGizmo() {
  const measure = useStore((s) => s.measure);
  const aRef = useRef<THREE.Mesh>(null);
  const bRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<THREE.Group>(null);
  const a = measure.a?.point;
  const b = measure.b?.point;
  const delta = measureDelta(measure.a, measure.b);
  const mid: [number, number, number] | null =
    a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] : null;
  useFrame(() => {
    if (aRef.current) pinWorldSize(aRef.current);
    if (bRef.current) pinWorldSize(bRef.current);
    if (labelRef.current) pinWorldSize(labelRef.current);
  });
  return (
    <group>
      {a ? (
        <mesh ref={aRef} position={a} renderOrder={20} raycast={() => {}}>
          <sphereGeometry args={[0.004, 12, 8]} />
          <meshBasicMaterial color="#2563eb" depthTest={false} depthWrite={false} />
        </mesh>
      ) : null}
      {b ? (
        <mesh ref={bRef} position={b} renderOrder={20} raycast={() => {}}>
          <sphereGeometry args={[0.004, 12, 8]} />
          <meshBasicMaterial color="#dc2626" depthTest={false} depthWrite={false} />
        </mesh>
      ) : null}
      {a && b ? (
        <Line points={[a, b]} color="#2563eb" lineWidth={2} depthTest={false} />
      ) : null}
      {mid && delta ? (
        // The distance sits in the world above the line's midpoint, so it can
        // be read without looking at the wrist card. World size is pinned so
        // the label stays legible at any model scale.
        <group ref={labelRef} position={mid}>
          <Billboard>
            <group position={[0, 0.014, 0]} renderOrder={21}>
              <Container
                pixelSize={0.0006}
                paddingX={10}
                paddingY={5}
                borderRadius={10}
                backgroundColor="#18181b"
                pointerEvents="none"
                depthTest={false}
              >
                <Text fontSize={18} color="#fafafa">
                  {formatMm(delta.dist)}
                </Text>
              </Container>
            </group>
          </Billboard>
        </group>
      ) : null}
    </group>
  );
}
