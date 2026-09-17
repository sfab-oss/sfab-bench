import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { type ReactNode, useEffect, useState } from "react";

export type PreviewSel = "o12" | "body" | null;

function Bracket({
  selected,
  onSelect,
}: {
  selected: PreviewSel;
  onSelect: (id: PreviewSel) => void;
}) {
  const hole = selected === "o12";
  const body = selected === "body";
  return (
    <group position={[0, 0.05, 0]} rotation={[-0.42, 0.55, 0.08]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect("body");
        }}
        position={[0, 0, 0]}
      >
        <boxGeometry args={[2.05, 0.22, 1.28]} />
        <meshStandardMaterial
          color={body ? "#c2185b" : "#8d8d8d"}
          metalness={0.45}
          roughness={0.32}
        />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.2, 40]} />
        <meshStandardMaterial
          color="#6f6f6f"
          metalness={0.5}
          roughness={0.28}
        />
      </mesh>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect("o12");
        }}
        position={[0, 0.2, 0]}
      >
        <cylinderGeometry args={[0.16, 0.16, 0.55, 32]} />
        <meshStandardMaterial
          color={hole ? "#e4007c" : "#141414"}
          metalness={0.2}
          roughness={0.5}
        />
      </mesh>
    </group>
  );
}

function Scene({
  selected,
  onSelect,
}: {
  selected: PreviewSel;
  onSelect: (id: PreviewSel) => void;
}) {
  return (
    <>
      <color args={["#0c0c0c"]} attach="background" />
      <ambientLight intensity={0.55} />
      <directionalLight intensity={1.15} position={[4, 6, 3]} />
      <directionalLight intensity={0.35} position={[-3, 2, -2]} />
      <Bracket onSelect={onSelect} selected={selected} />
      <ContactShadows
        blur={2.2}
        far={4}
        opacity={0.35}
        position={[0, -0.55, 0]}
        scale={6}
      />
      <OrbitControls
        enablePan={false}
        maxDistance={6}
        minDistance={2.2}
        target={[0, 0.05, 0]}
      />
    </>
  );
}

export function PreviewCanvas({
  onSelect,
  selected,
}: {
  selected: PreviewSel;
  onSelect: (id: PreviewSel) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="h-full w-full bg-[#0c0c0c]" />;
  }
  return (
    <Canvas
      camera={{ fov: 35, position: [2.8, 1.8, 3.4] }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false }}
      onPointerMissed={() => onSelect(null)}
    >
      <Scene onSelect={onSelect} selected={selected} />
    </Canvas>
  );
}

export function PreviewShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      {children}
    </div>
  );
}
