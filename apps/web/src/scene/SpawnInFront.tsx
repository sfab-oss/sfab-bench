import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useShallow } from "zustand/react/shallow";

import { useStore } from "@/state/store";

const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();

/** Floor-plane metres. Chat and files cards spawn at 0.55; the model stays a step behind them. */
export const XR_CAD_SPAWN_DISTANCE = 0.7;
export const XR_CAD_SPAWN_DROP = 0.12;

/** Yaw-only billboard so `obj` (or `lookAt`) faces the camera on the floor plane. */
export function faceToward(
  obj: THREE.Object3D,
  camera: THREE.Camera,
  lookAt?: THREE.Vector3
) {
  camera.getWorldPosition(pos);
  const px = lookAt?.x ?? obj.position.x;
  const pz = lookAt?.z ?? obj.position.z;
  obj.rotation.set(0, Math.atan2(pos.x - px, pos.z - pz), 0);
}

/**
 * Puts `obj` on the floor-plane line of sight, `distance` ahead and `drop`
 * below the eyes. `face` turns it to look back at the wearer (yaw only);
 * otherwise it keeps the world orientation.
 */
export function placeAtGaze(
  obj: THREE.Object3D,
  camera: THREE.Camera,
  {
    distance = XR_CAD_SPAWN_DISTANCE,
    drop = XR_CAD_SPAWN_DROP,
    face = false,
    resetScale = true,
    side = 0,
  } = {}
) {
  camera.getWorldPosition(pos);
  camera.getWorldQuaternion(quat);
  forward.set(0, 0, -1).applyQuaternion(quat);
  // Straight up or down the gaze has no floor direction left in it, and flattening
  // it would drop the model on the wearer's feet. The head still knows which way it
  // is pointing: its own up vector is where the forehead goes, which is the bearing
  // the wearer would walk in, so it takes over continuously as the gaze goes vertical.
  if (Math.abs(forward.y) > 0.999) {
    const sign = forward.y < 0 ? 1 : -1;
    forward.set(0, 1, 0).applyQuaternion(quat).multiplyScalar(sign);
  }
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  obj.position.copy(pos).addScaledVector(forward, distance);
  obj.position.y = pos.y - drop;
  if (side) {
    right.set(1, 0, 0).applyQuaternion(quat);
    right.y = 0;
    if (right.lengthSq() > 1e-6)
      obj.position.addScaledVector(right.normalize(), side);
  }
  if (face) faceToward(obj, camera);
  else obj.quaternion.identity();
  if (resetScale) obj.scale.setScalar(1);
}

export type CadSpawnKey = { session: unknown; url: string };

/** First spawn / file switch / new session. Same-path reload in this session is false. */
export function shouldPlaceAtGaze(input: {
  session: unknown;
  url: string;
  last: CadSpawnKey | null;
}): boolean {
  if (!input.session || !input.url) return false;
  return input.last?.session !== input.session || input.last?.url !== input.url;
}

/** Close the file or leave Studio: next open of the same path is a first spawn. */
export function forgetCadSpawnKey(
  last: CadSpawnKey | null,
  session: unknown,
  url: string
): CadSpawnKey | null {
  if (!session || !url) return null;
  return last;
}

export function SpawnInFront() {
  const session = useXR((s) => s.session);
  const camera = useThree((s) => s.camera);
  const { url, review, placed, setRecenter, setModelScale } = useStore(
    useShallow((s) => ({
      url: s.url,
      review: s.review,
      placed: s.placed,
      setRecenter: s.setRecenter,
      setModelScale: s.setModelScale,
    }))
  );
  const last = useRef<CadSpawnKey | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    last.current = forgetCadSpawnKey(last.current, session, url);
    pending.current =
      shouldPlaceAtGaze({ session, url, last: last.current }) &&
      Boolean(review && placed);
  }, [session, url, review, placed]);

  // "Recenter" on the card: same placement as the first spawn, at 1:1.
  useEffect(() => {
    if (!session || !placed) {
      setRecenter(null);
      return;
    }
    setRecenter(() => {
      placeAtGaze(placed, camera, {
        distance: XR_CAD_SPAWN_DISTANCE,
        drop: XR_CAD_SPAWN_DROP,
        face: true,
      });
      setModelScale(1);
    });
    return () => setRecenter(null);
  }, [session, placed, camera, setRecenter, setModelScale]);

  useFrame(() => {
    if (!pending.current || !session || !url || !review || !placed) return;
    camera.getWorldPosition(pos);
    if (pos.lengthSq() < 0.01) return;
    pending.current = false;
    placeAtGaze(placed, camera, {
      distance: XR_CAD_SPAWN_DISTANCE,
      drop: XR_CAD_SPAWN_DROP,
      face: true,
    });
    setModelScale(1);
    last.current = { session, url };
  });

  return null;
}
