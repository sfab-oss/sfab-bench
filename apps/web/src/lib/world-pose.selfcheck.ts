import * as THREE from "three";

import {
  WORLD_TO_SCENE_X,
  worldPointInScene,
  worldQuatToThree,
} from "./world-pose";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

const near = (got: number, want: number, eps = 1e-6) => {
  if (!(Math.abs(got - want) <= eps)) {
    throw new Error(`${got} is not ${want}`);
  }
};

const identity = worldQuatToThree([1, 0, 0, 0]);
expect(
  identity.x === 0 && identity.y === 0 && identity.z === 0,
  "identity x y z"
);
expect(identity.w === 1, "identity scalar is three w");

// 90° about MuJoCo +Z: [w, x, y, z] = [cos(θ/2), 0, 0, sin(θ/2)].
const half = Math.PI / 4;
const aboutZ = worldQuatToThree([Math.cos(half), 0, 0, Math.sin(half)]);
const swung = new THREE.Vector3(1, 0, 0).applyQuaternion(aboutZ);
near(swung.x, 0);
near(swung.y, 1);
near(swung.z, 0);

// The content group turns Z-up into the CAD viewer's Y-up scene.
expect(WORLD_TO_SCENE_X === -Math.PI / 2, "same quarter-turn as a STEP root");

const up = worldPointInScene([0, 0, 1]);
near(up.x, 0);
near(up.y, 1);
near(up.z, 0);

const cadY = worldPointInScene([0, 1, 0]);
near(cadY.x, 0);
near(cadY.y, 0);
near(cadY.z, -1);

const group = new THREE.Group();
group.rotation.x = WORLD_TO_SCENE_X;
const link = new THREE.Object3D();
link.position.set(0, 0, 0.02);
link.quaternion.copy(aboutZ);
group.add(link);
group.updateMatrixWorld(true);
const scene = link.getWorldPosition(new THREE.Vector3());
near(scene.x, 0);
near(scene.y, 0.02, 1e-6);
near(scene.z, 0);

// The Z spin, after the same parent turn, stays in the floor plane:
// MuJoCo +Y is three −Z, so +X swings toward −Z.
const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(
  link.getWorldQuaternion(new THREE.Quaternion())
);
near(localX.y, 0);
near(localX.z, -1);

console.log("world-pose.selfcheck ok");
