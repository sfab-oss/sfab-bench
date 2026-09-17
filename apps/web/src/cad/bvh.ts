import * as THREE from "three";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";

// Patch three once so every Mesh raycast (ours and R3F's pointer raycaster)
// uses the BVH when the geometry has one.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/** Build a BVH for every mesh geometry under `root` that does not have one yet. */
export function buildBoundsTrees(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry as THREE.BufferGeometry | undefined;
    if (!geometry || geometry.boundsTree) return;
    geometry.computeBoundsTree();
  });
}
