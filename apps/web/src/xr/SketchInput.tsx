import { useFrame } from "@react-three/fiber";
import {
  useXRControllerButtonEvent,
  useXRInputSourceEvent,
  useXRInputSourceState,
  XRSpace,
} from "@react-three/xr";
import { useEffect, useRef } from "react";
import * as THREE from "three";

import { sketchWrap } from "@/scene/sketch-anchor";
import { probeFaceNear, projectOnPlane } from "@/scene/sketches";
import { store, useStore } from "@/state/store";
import { hitChrome, rayHitsChrome } from "@/xr/ui/chrome";

const tipWorld = new THREE.Vector3();
const local = new THREE.Vector3();
const projected = new THREE.Vector3();
const drawRay = new THREE.Ray();
const drawDir = new THREE.Vector3();

function chromeBlocksDraw(
  controllerTip: THREE.Object3D | null,
  handTip: THREE.Object3D | null
): boolean {
  if (handTip) {
    handTip.updateWorldMatrix(true, false);
    handTip.getWorldPosition(tipWorld);
    return hitChrome(tipWorld) != null;
  }
  if (!controllerTip) return false;
  controllerTip.updateWorldMatrix(true, false);
  controllerTip.getWorldPosition(drawRay.origin);
  drawDir.set(0, 0, -1).transformDirection(controllerTip.matrixWorld);
  drawRay.direction.copy(drawDir);
  return rayHitsChrome(drawRay);
}

function sampleTip(
  controllerTip: THREE.Object3D | null,
  handTip: THREE.Object3D | null,
  out: THREE.Vector3
): boolean {
  const obj = handTip ?? controllerTip;
  if (!obj) return false;
  obj.updateWorldMatrix(true, false);
  obj.getWorldPosition(out);
  return true;
}

/**
 * Hold right trigger (controller) or pinch (hand); sample the tip in wrap-local
 * metres. First face hit within snap radius sets `on` and pins the rest of that
 * stroke to that plane.
 */
export function SketchInput() {
  const tool = useStore((s) => s.tool);
  const right = useXRInputSourceState("controller", "right");
  const rightHand = useXRInputSourceState("hand", "right");
  const controllerTip = useRef<THREE.Object3D | null>(null);
  const handTip = useRef<THREE.Object3D | null>(null);
  const drawing = useRef(false);
  const plane = useRef<{
    origin: THREE.Vector3;
    normal: THREE.Vector3;
  } | null>(null);

  const begin = () => {
    const s = store.getState();
    if (s.tool !== "sketch") return;
    if (s.toolsOpen || s.worldGrabbing || s.cardDragging) return;
    if (!sketchWrap()) return;
    if (chromeBlocksDraw(controllerTip.current, handTip.current)) return;
    if (drawing.current) return;
    drawing.current = true;
    plane.current = null;
    s.beginSketch();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    plane.current = null;
    store.getState().commitSketch();
  };

  useXRControllerButtonEvent(right, "trigger", (state) => {
    if (state === "pressed") begin();
    else end();
  });

  useXRInputSourceEvent(
    "all",
    "selectstart",
    (event) => {
      if (!event.inputSource.hand) return;
      if (event.inputSource.handedness !== "right") return;
      begin();
    },
    []
  );
  useXRInputSourceEvent(
    "all",
    "selectend",
    (event) => {
      if (!event.inputSource.hand) return;
      if (event.inputSource.handedness !== "right") return;
      end();
    },
    []
  );

  useEffect(() => {
    if (tool !== "sketch" && drawing.current) end();
  }, [tool]);

  useFrame(() => {
    if (!drawing.current) return;
    const s = store.getState();
    if (s.tool !== "sketch") {
      end();
      return;
    }
    if (s.worldGrabbing || s.cardDragging || s.toolsOpen) return;
    if (!sampleTip(controllerTip.current, handTip.current, tipWorld)) return;

    let world = tipWorld;
    if (plane.current) {
      projectOnPlane(
        tipWorld,
        plane.current.origin,
        plane.current.normal,
        projected
      );
      world = projected;
    } else if (s.review && !s.draft?.on) {
      const hit = probeFaceNear(s.review, tipWorld);
      if (hit) {
        plane.current = {
          origin: hit.point.clone(),
          normal: hit.normal.clone(),
        };
        s.setDraftSnap(hit.cadRef);
        world = hit.point;
      }
    }

    const wrap = sketchWrap();
    if (!wrap) return;
    wrap.worldToLocal(local.copy(world));
    store.getState().appendSketchPoint([local.x, local.y, local.z]);
  });

  const controllerSpace =
    right?.inputSource.targetRaySpace ?? right?.inputSource.gripSpace;
  const finger = rightHand?.inputSource.hand?.get("index-finger-tip");

  return (
    <>
      {controllerSpace ? (
        <XRSpace
          ref={(obj) => {
            controllerTip.current = obj;
          }}
          space={controllerSpace}
        >
          {tool === "sketch" ? (
            <mesh raycast={() => {}} position={[0, 0, -0.01]}>
              <sphereGeometry args={[0.004, 12, 12]} />
              <meshBasicMaterial color="#38bdf8" depthTest={false} />
            </mesh>
          ) : null}
        </XRSpace>
      ) : null}
      {finger ? (
        <XRSpace
          ref={(obj) => {
            handTip.current = obj;
          }}
          space={finger}
        >
          {tool === "sketch" && !right ? (
            <mesh raycast={() => {}}>
              <sphereGeometry args={[0.004, 12, 12]} />
              <meshBasicMaterial color="#38bdf8" depthTest={false} />
            </mesh>
          ) : null}
        </XRSpace>
      ) : null}
    </>
  );
}
