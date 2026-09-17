import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import type { PreviewSel } from "@/components/preview/preview-types";

function Bracket({
  hidden,
  onSelect,
  selected,
}: {
  hidden?: PreviewSel;
  onSelect: (id: PreviewSel) => void;
  selected: PreviewSel;
}) {
  const hole = selected === "o12";
  const body = selected === "body";
  return (
    <group position={[0, 0.05, 0]} rotation={[-0.42, 0.55, 0.08]}>
      {hidden === "body" ? null : (
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
      )}
      {hidden === "body" ? null : (
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.42, 0.42, 0.2, 40]} />
          <meshStandardMaterial
            color="#6f6f6f"
            metalness={0.5}
            roughness={0.28}
          />
        </mesh>
      )}
      {hidden === "o12" ? null : (
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
      )}
    </group>
  );
}

function Scene({
  axes,
  hidden,
  onSelect,
  selected,
  studio,
}: {
  axes?: boolean;
  hidden?: PreviewSel;
  onSelect: (id: PreviewSel) => void;
  selected: PreviewSel;
  studio: string;
}) {
  return (
    <>
      <color args={[studio]} attach="background" />
      <ambientLight intensity={0.55} />
      <directionalLight intensity={1.15} position={[4, 6, 3]} />
      <directionalLight intensity={0.35} position={[-3, 2, -2]} />
      <Bracket hidden={hidden} onSelect={onSelect} selected={selected} />
      <ContactShadows
        blur={2.2}
        far={4}
        opacity={0.35}
        position={[0, -0.55, 0]}
        scale={6}
      />
      {axes ? <axesHelper args={[1.4]} /> : null}
      <OrbitControls
        enablePan={false}
        maxDistance={6}
        minDistance={2.2}
        target={[0, 0.05, 0]}
      />
    </>
  );
}

function useStudioHex() {
  const [hex, setHex] = useState("#1a1d21");
  useEffect(() => {
    const el = document.querySelector("[data-preview-workbench]");
    if (!el) return;
    const read = () => {
      const value = getComputedStyle(el).getPropertyValue("--studio").trim();
      if (value) setHex(value);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });
    return () => mo.disconnect();
  }, []);
  return hex;
}

export function PreviewCanvas({
  axes,
  hidden,
  onSelect,
  selected,
}: {
  axes?: boolean;
  hidden?: PreviewSel;
  onSelect: (id: PreviewSel) => void;
  selected: PreviewSel;
}) {
  const studio = useStudioHex();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="h-full w-full bg-studio" />;
  }
  return (
    <Canvas
      camera={{ fov: 35, position: [2.8, 1.8, 3.4] }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false }}
      onPointerMissed={() => onSelect(null)}
    >
      <Scene
        axes={axes}
        hidden={hidden}
        onSelect={onSelect}
        selected={selected}
        studio={studio}
      />
    </Canvas>
  );
}
