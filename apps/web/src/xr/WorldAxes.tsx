import { useMemo } from "react";
import * as THREE from "three";

function Label({
  text,
  color,
  position,
  size,
}: {
  text: string;
  color: string;
  position: [number, number, number];
  size: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.font = "700 48px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.fillText(text, 32, 36);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [text, color]);
  return (
    <sprite position={position} scale={[size, size, size]} raycast={() => {}}>
      <spriteMaterial map={texture} depthTest transparent />
    </sprite>
  );
}

function Arrow({
  color,
  rotation,
  label,
  length,
}: {
  color: string;
  rotation: [number, number, number];
  label: string;
  length: number;
}) {
  const shaft = length * 0.8;
  const head = length * 0.2;
  const r = Math.max(length * 0.028, 0.0014);
  return (
    <group rotation={rotation}>
      <mesh position={[0, shaft / 2, 0]} raycast={() => {}}>
        <cylinderGeometry args={[r, r, shaft, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, shaft + head / 2, 0]} raycast={() => {}}>
        <coneGeometry args={[r * 2.4, head, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Label
        text={label}
        color={color}
        position={[0, length + length * 0.18, 0]}
        size={length * 0.24}
      />
    </group>
  );
}

export function WorldAxes({ length }: { length: number }) {
  const hub = Math.max(length * 0.045, 0.002);
  return (
    <group>
      <mesh raycast={() => {}}>
        <sphereGeometry args={[hub, 16, 12]} />
        <meshBasicMaterial color="#f4f4f5" />
      </mesh>
      <Arrow
        color="#e11d48"
        rotation={[0, 0, -Math.PI / 2]}
        label="X"
        length={length}
      />
      <Arrow color="#16a34a" rotation={[0, 0, 0]} label="Y" length={length} />
      <Arrow
        color="#2563eb"
        rotation={[Math.PI / 2, 0, 0]}
        label="Z"
        length={length}
      />
    </group>
  );
}
