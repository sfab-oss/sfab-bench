import { useMemo } from "react";
import * as THREE from "three";

import {
  J1,
  J3,
  PCB_LENGTH,
  PCB_THICKNESS,
  PCB_WIDTH,
  pinZ,
} from "./devkit-m1";

const HEADER_X = 22.86 / 2;

const noHit = () => null;

function silkTexture(): THREE.CanvasTexture {
  const width = 512;
  const height = Math.round(width * (PCB_LENGTH / PCB_WIDTH));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("board silk canvas");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f4f4f2";
  ctx.textBaseline = "middle";
  ctx.font = "600 15px ui-sans-serif, sans-serif";

  const toPx = (x: number, z: number) => ({
    x: ((x + PCB_WIDTH / 2) / PCB_WIDTH) * width,
    y: ((PCB_LENGTH / 2 - z) / PCB_LENGTH) * height,
  });

  const drawRow = (
    names: readonly string[],
    x: number,
    align: CanvasTextAlign
  ) => {
    ctx.textAlign = align;
    for (let i = 0; i < names.length; i++) {
      const at = toPx(x, pinZ(i, names.length));
      ctx.fillText(names[i], at.x, at.y);
    }
  };
  drawRow(J1, -7.2, "right");
  drawRow(J3, 7.2, "left");

  ctx.textAlign = "center";
  ctx.font = "600 18px ui-sans-serif, sans-serif";
  const title = toPx(0, -2);
  ctx.fillText("ESP32-C3", title.x, title.y - 12);
  ctx.font = "500 13px ui-sans-serif, sans-serif";
  ctx.fillText("DevKitM-1", title.x, title.y + 10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.center.set(0.5, 0.5);
  texture.rotation = Math.PI;
  texture.needsUpdate = true;
  return texture;
}

function Header({ x, count }: { x: number; count: number }) {
  const span = (count - 1) * 2.54;
  return (
    <group position={[x, PCB_THICKNESS / 2, 0]}>
      <mesh position={[0, 1.15, 0]} raycast={noHit}>
        <boxGeometry args={[2.2, 2.3, span + 1.8]} />
        <meshStandardMaterial color="#161616" roughness={0.72} />
      </mesh>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} position={[0, 2.1, pinZ(i, count)]} raycast={noHit}>
          <cylinderGeometry args={[0.26, 0.26, 5.4, 8]} />
          <meshStandardMaterial
            color="#c6a15b"
            metalness={0.55}
            roughness={0.38}
          />
        </mesh>
      ))}
    </group>
  );
}

function Module() {
  return (
    <group position={[0, PCB_THICKNESS / 2, 14.2]}>
      <mesh position={[0, 0.45, 9.4]} raycast={noHit}>
        <boxGeometry args={[12.2, 0.9, 10]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.45, -0.4]} raycast={noHit}>
        <boxGeometry args={[13.2, 2.4, 12.4]} />
        <meshStandardMaterial
          color="#d5d8de"
          metalness={0.8}
          roughness={0.28}
        />
      </mesh>
    </group>
  );
}

function Usb() {
  return (
    <group position={[0, 1.7, -PCB_LENGTH / 2 - 1.6]}>
      <mesh raycast={noHit}>
        <boxGeometry args={[7.6, 3.2, 5.2]} />
        <meshStandardMaterial
          color="#b9bcc2"
          metalness={0.65}
          roughness={0.34}
        />
      </mesh>
      <mesh position={[0, 0, 0.4]} raycast={noHit}>
        <boxGeometry args={[5.4, 1.5, 4.2]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.5} />
      </mesh>
    </group>
  );
}

function ButtonCap({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} raycast={noHit}>
      <cylinderGeometry args={[1.7, 1.85, 2.1, 16]} />
      <meshStandardMaterial color="#1a1a1a" roughness={0.55} />
    </mesh>
  );
}

/** Fixed likeness of the ESP32-C3-DevKitM-1. Pins are not selectable. */
export function DevKitM1() {
  const silk = useMemo(() => silkTexture(), []);
  return (
    <group>
      <mesh position={[0, 0, 0]} raycast={noHit}>
        <boxGeometry args={[PCB_WIDTH, PCB_THICKNESS, PCB_LENGTH]} />
        <meshStandardMaterial color="#141414" roughness={0.86} />
      </mesh>
      <mesh
        position={[0, PCB_THICKNESS / 2 + 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={noHit}
      >
        <planeGeometry args={[PCB_WIDTH - 0.4, PCB_LENGTH - 0.4]} />
        <meshStandardMaterial map={silk} transparent roughness={0.8} />
      </mesh>
      <Header x={-HEADER_X} count={J1.length} />
      <Header x={HEADER_X} count={J3.length} />
      <Module />
      <Usb />
      <ButtonCap position={[-6.2, 2.2, -13.6]} />
      <ButtonCap position={[6.4, 2.2, -13.6]} />
      <mesh position={[8.1, 1.5, 4.2]} raycast={noHit}>
        <sphereGeometry args={[0.85, 16, 12]} />
        <meshStandardMaterial color="#efeae2" roughness={0.35} />
      </mesh>
    </group>
  );
}
