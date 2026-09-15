import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { IfInSessionMode, XR } from "@react-three/xr";
import { Suspense, useCallback, useEffect, useLayoutEffect } from "react";
import * as THREE from "three";

import { RenderErrorBoundary } from "@/components/RenderErrorBoundary";
import { useStudioColor } from "@/hooks/useStudioColor";
import { CadModel } from "@/scene/CadModel";
import { RecenterOnReset } from "@/scene/RecenterOnReset";
import { SpawnInFront } from "@/scene/SpawnInFront";
import { store, useStore } from "@/state/store";
import { useXrTheme } from "@/xr/ui/theme";
import { CornerAxes, RightAxes, RightHandAxes } from "@/xr/RightAxes";
import { ToolDrawer } from "@/xr/ToolDrawer";
import { HandRig } from "@/xr/hands/HandRig";
import { HandSkeletons } from "@/xr/hands/HandSkeleton";
import { HandTools } from "@/xr/hands/HandTools";
import { WristWatch } from "@/xr/hands/WristWatch";
import { XRGrab } from "@/xr/hands/XRGrab";
import { CardDock } from "@/xr/ui/CardDock";
import { ChatDock } from "@/xr/ui/ChatDock";
import { xrStore } from "@/xrStore";

function StudioFloor() {
  const theme = useXrTheme();
  return (
    <IfInSessionMode allow="immersive-vr">
      <color attach="background" args={[theme.studio]} />
      <gridHelper args={[8, 32, theme.gridMajor, theme.gridMinor]} />
    </IfInSessionMode>
  );
}

function FitBridge() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as {
    target: THREE.Vector3;
    update: () => void;
  } | null;
  const setFit = useStore((s) => s.setFit);

  useLayoutEffect(() => {
    setFit((obj, dir) => {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty() || !(camera instanceof THREE.PerspectiveCamera)) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() * 0.5;
    const fov = (camera.fov * Math.PI) / 180;
    const dist = Math.max((radius / Math.sin(fov / 2)) * 1.2, radius * 1.5, 0.05);
    const from =
      dir?.clone().normalize() ??
      camera.position.clone().sub(controls?.target ?? new THREE.Vector3()).normalize();
    if (from.lengthSq() < 1e-6) from.set(0.6, 0.5, 0.7).normalize();
    camera.position.copy(center).addScaledVector(from, dist);
    if (controls) {
      controls.target.copy(center);
      controls.update();
    }
    });
  }, [camera, controls, setFit]);
  return null;
}

function SceneCrashBridge({ error, reset }: { error: unknown; reset: () => void }) {
  const setSceneCrash = useStore((s) => s.setSceneCrash);
  useEffect(() => {
    setSceneCrash({ error, reset });
    return () => setSceneCrash(null);
  }, [error, reset, setSceneCrash]);
  return null;
}

export function ViewerCanvas() {
  const studio = useStudioColor();
  const url = useStore((s) => s.url);
  const setPlaced = useStore((s) => s.setPlaced);
  const onFit = useCallback(
    (obj: THREE.Object3D) => store.getState().fit?.(obj, new THREE.Vector3(0.6, 0.5, 0.7)),
    [],
  );

  return (
    <Canvas
      style={{ position: "absolute", inset: 0 }}
      camera={{ position: [0.42, 0.32, 0.5], fov: 50, near: 0.01, far: 50 }}
      gl={{ antialias: true, alpha: true, localClippingEnabled: true }}
    >
      <XR store={xrStore}>
        <IfInSessionMode deny="immersive-ar">
          <color attach="background" args={[studio]} />
        </IfInSessionMode>
        <StudioFloor />
        <RecenterOnReset />
        <hemisphereLight args={[0xffffff, 0xb8bcc2, 0.95]} />
        <directionalLight position={[0.55, 1.1, 0.45]} intensity={1.35} />
        <directionalLight position={[-0.6, 0.25, -0.35]} intensity={0.35} />
        <FitBridge />
        <group
          ref={(group) => {
            setPlaced(group);
          }}
        >
          <SpawnInFront />
          <RenderErrorBoundary
            resetKeys={[url]}
            fallback={({ error, reset }) => <SceneCrashBridge error={error} reset={reset} />}
          >
            <CadModel onFit={onFit} />
          </RenderErrorBoundary>
        </group>
        <XRGrab />
        <HandSkeletons />
        {/* One wrist XRSpace per hand; everything wrist-mounted hangs off it. */}
        <HandRig handedness="left">
          <WristWatch />
        </HandRig>
        <HandRig handedness="right">
          <HandTools />
          <RightHandAxes />
        </HandRig>
        <RightAxes />
        <Suspense fallback={null}>
          <CardDock />
          <ChatDock />
          <ToolDrawer />
        </Suspense>
        <IfInSessionMode deny={["immersive-ar", "immersive-vr"]}>
          <OrbitControls makeDefault enableDamping />
          <CornerAxes />
        </IfInSessionMode>
      </XR>
    </Canvas>
  );
}
