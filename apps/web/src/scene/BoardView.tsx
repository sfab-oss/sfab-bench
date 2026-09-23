import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";

import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/hooks/useMotionReady";
import { useStudioColor } from "@/hooks/useStudioColor";
import { STUDIO_HEX } from "@/lib/appearance";
import { orbitDampingEnabled } from "@/lib/motion";

import { DevKitM1 } from "./DevKitM1";
import { BOARD_STAGE_DARK, HOME_CAMERA, HOME_TARGET } from "./devkit-m1";

type OrbitHandle = {
  target: THREE.Vector3;
  update: () => void;
};

function applyHome(
  camera: THREE.Camera,
  controls: OrbitHandle | null,
  invalidate: () => void
) {
  camera.position.set(HOME_CAMERA[0], HOME_CAMERA[1], HOME_CAMERA[2]);
  camera.lookAt(HOME_TARGET[0], HOME_TARGET[1], HOME_TARGET[2]);
  if (controls) {
    controls.target.set(HOME_TARGET[0], HOME_TARGET[1], HOME_TARGET[2]);
    controls.update();
  }
  invalidate();
}

function HomeBridge({ home }: { home: { current: () => void } }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as OrbitHandle | null;
  useEffect(() => {
    home.current = () => applyHome(camera, controls, invalidate);
  }, [camera, controls, home, invalidate]);
  return null;
}

function PaintOnChange({ token }: { token: string }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
  }, [token, invalidate]);
  return null;
}

/** Device main view. Unmounting it (leaving Device) drops the camera. */
export function BoardView() {
  const studio = useStudioColor();
  const stage = studio === STUDIO_HEX.dark ? BOARD_STAGE_DARK : studio;
  const reduceMotion = usePrefersReducedMotion();
  const home = useRef<() => void>(() => {});
  const homeTarget = useMemo<[number, number, number]>(
    () => [HOME_TARGET[0], HOME_TARGET[1], HOME_TARGET[2]],
    []
  );

  return (
    <div className="relative min-h-0 min-w-0 flex-1 bg-studio">
      <Canvas
        className="absolute inset-0"
        camera={{
          position: [HOME_CAMERA[0], HOME_CAMERA[1], HOME_CAMERA[2]],
          fov: 32,
          near: 0.1,
          far: 400,
        }}
        frameloop="demand"
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={[stage]} />
        <PaintOnChange token={stage} />
        <hemisphereLight args={["#ffffff", "#b8bcc2", 0.95]} />
        <directionalLight position={[18, 28, 12]} intensity={1.4} />
        <directionalLight position={[-16, 10, -18]} intensity={0.4} />
        <DevKitM1 />
        <HomeBridge home={home} />
        <OrbitControls
          makeDefault
          enableDamping={orbitDampingEnabled(reduceMotion)}
          minDistance={16}
          maxDistance={140}
          target={homeTarget}
        />
      </Canvas>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute top-3 right-3"
        onClick={() => home.current()}
      >
        Home
      </Button>
    </div>
  );
}
