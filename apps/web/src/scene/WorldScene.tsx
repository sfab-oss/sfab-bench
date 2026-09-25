import { useFrame } from "@react-three/fiber";
import type {
  WorldPose,
  WorldPrimitive,
  WorldVec3,
} from "@sfab-bench/contract";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

import {
  type LoadedVisual,
  type LoadedWorld,
  loadWorldAssets,
  releaseMeshes,
} from "@/lib/world-assets";
import {
  urdfRpyQuaternion,
  WORLD_TO_SCENE_X,
  worldQuatToThree,
} from "@/lib/world-pose";
import { invalidateSceneNow } from "@/scene/invalidate";
import { setWorldFitTarget } from "@/scene/world-fit";
import { useWorld, worldLiveState, worldStore } from "@/state/world";
import { useXrTheme } from "@/xr/ui/theme";

const ROBOT_COLORS = [0xc4b8a5, 0x8fa3b0, 0xb7a0c4, 0xa3b59a, 0xc4a090];
const GROUND = 4;

function finiteVec(v: readonly number[], n: number): boolean {
  return v.length >= n && v.slice(0, n).every((item) => Number.isFinite(item));
}

function labelTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = "600 36px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 34);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function WorldGround() {
  const theme = useXrTheme();
  const grid = useMemo(() => {
    const helper = new THREE.GridHelper(
      GROUND,
      40,
      theme.gridMajor,
      theme.gridMinor
    );
    helper.raycast = () => {};
    return helper;
  }, [theme.gridMajor, theme.gridMinor]);
  useEffect(() => {
    return () => {
      grid.geometry.dispose();
      const material = grid.material;
      if (Array.isArray(material)) {
        for (const item of material) item.dispose();
      } else material.dispose();
    };
  }, [grid]);
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.002} raycast={() => {}}>
        <planeGeometry args={[GROUND, GROUND]} />
        <meshStandardMaterial color={theme.gridMinor} roughness={1} />
      </mesh>
      <primitive object={grid} />
    </>
  );
}

function Body({ pose, children }: { pose: WorldPose; children: ReactNode }) {
  const quaternion = useMemo(() => worldQuatToThree(pose.rotation), [pose]);
  return (
    <group position={pose.position} quaternion={quaternion}>
      {children}
    </group>
  );
}

function BoardLabel({
  text,
  color,
  z,
}: {
  text: string;
  color: string;
  z: number;
}) {
  const texture = useMemo(() => labelTexture(text, color), [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite
      position={[0, 0, z]}
      scale={[0.05, 0.0125, 0.001]}
      raycast={() => {}}
    >
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

function ObjVisual({
  object,
  material,
  scale,
}: {
  object: THREE.Object3D;
  material: THREE.Material;
  scale: [number, number, number];
}) {
  const clone = useMemo(() => {
    const next = object.clone(true);
    next.scale.set(scale[0], scale[1], scale[2]);
    next.traverse((child) => {
      if (child instanceof THREE.Mesh) child.material = material;
    });
    return next;
  }, [object, material, scale]);
  return <primitive object={clone} />;
}

function PrimitiveMesh({
  primitive,
  material,
}: {
  primitive: WorldPrimitive;
  material: THREE.Material;
}) {
  if (primitive.shape === "box") {
    if (!finiteVec(primitive.size, 3)) return null;
    const [x, y, z] = primitive.size;
    return (
      <mesh material={material}>
        <boxGeometry args={[x, y, z]} />
      </mesh>
    );
  }
  if (primitive.shape === "sphere") {
    if (!Number.isFinite(primitive.size) || primitive.size <= 0) return null;
    return (
      <mesh material={material}>
        <sphereGeometry args={[primitive.size, 24, 16]} />
      </mesh>
    );
  }
  if (
    !Number.isFinite(primitive.size.radius) ||
    !Number.isFinite(primitive.size.length) ||
    primitive.size.radius <= 0 ||
    primitive.size.length <= 0
  ) {
    return null;
  }
  return (
    <mesh material={material} rotation-x={Math.PI / 2}>
      <cylinderGeometry
        args={[
          primitive.size.radius,
          primitive.size.radius,
          primitive.size.length,
          24,
        ]}
      />
    </mesh>
  );
}

function VisualOrigin({
  xyz,
  rpy,
  children,
}: {
  xyz: [number, number, number];
  rpy: [number, number, number];
  children: ReactNode;
}) {
  const quaternion = useMemo(() => urdfRpyQuaternion(rpy), [rpy]);
  return (
    <group position={xyz} quaternion={quaternion}>
      {children}
    </group>
  );
}

function linkKey(robotId: string, link: string) {
  return `${robotId}/${link}`;
}

export function WorldScene({
  onFit,
}: {
  onFit: (obj: THREE.Object3D) => void;
}) {
  const path = useWorld((s) => s.path);
  const loadId = useWorld((s) => s.loadId);
  const revision = useWorld((s) => s.revision);
  const [loaded, setLoaded] = useState<LoadedWorld | null>(null);
  const heldKeys = useRef<string[]>([]);
  const contentRef = useRef<THREE.Group>(null);
  const linkGroups = useRef(new Map<string, THREE.Group>());
  const theme = useXrTheme();

  useEffect(() => {
    let cancelled = false;
    if (!worldStore.getState().sceneReady) {
      worldStore.getState().setAssets("loading");
    }
    void loadWorldAssets(path, revision)
      .then((next) => {
        if (cancelled) {
          releaseMeshes(next.meshKeys);
          return;
        }
        const previous = heldKeys.current;
        heldKeys.current = next.meshKeys;
        setLoaded(next);
        worldStore.getState().setAssetIssues(next.problems);
        worldStore.getState().setAssets("ready", true);
        releaseMeshes(previous);
        invalidateSceneNow();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        const ready = worldStore.getState().sceneReady;
        worldStore.getState().setAssetIssues([{ text: message }]);
        worldStore.getState().setAssets(ready ? "ready" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [path, loadId, revision]);

  useEffect(() => {
    return () => {
      releaseMeshes(heldKeys.current);
      heldKeys.current = [];
      setWorldFitTarget(null);
    };
  }, []);

  const robots = useMemo(() => {
    const byRobot = new Map<string, Map<string, LoadedVisual[]>>();
    for (const visual of loaded?.visuals ?? []) {
      let links = byRobot.get(visual.robotId);
      if (!links) {
        links = new Map();
        byRobot.set(visual.robotId, links);
      }
      const list = links.get(visual.link) ?? [];
      list.push(visual);
      links.set(visual.link, list);
    }
    return [...byRobot.entries()];
  }, [loaded]);

  const materials = useMemo(
    () =>
      robots.map(
        (_, index) =>
          new THREE.MeshStandardMaterial({
            color: ROBOT_COLORS[index % ROBOT_COLORS.length],
            metalness: 0.12,
            roughness: 0.62,
            side: THREE.DoubleSide,
          })
      ),
    [robots]
  );
  useEffect(() => {
    return () => {
      for (const material of materials) material.dispose();
    };
  }, [materials]);

  const boardMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x6d8ea3,
        metalness: 0.08,
        roughness: 0.7,
      }),
    []
  );
  const primitiveMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xb0b4b8,
        metalness: 0.05,
        roughness: 0.85,
      }),
    []
  );
  useEffect(() => {
    return () => {
      boardMaterial.dispose();
      primitiveMaterial.dispose();
    };
  }, [boardMaterial, primitiveMaterial]);

  useFrame(() => {
    const state = worldLiveState();
    if (!state) return;
    for (const [robotId, links] of Object.entries(state.poses)) {
      for (const [name, pose] of Object.entries(links)) {
        const group = linkGroups.current.get(linkKey(robotId, name));
        if (!group) continue;
        const p = pose.p;
        const q = pose.q;
        group.position.set(p[0], p[1], p[2]);
        group.quaternion.set(q[1], q[2], q[3], q[0]);
      }
    }
  });

  useLayoutEffect(() => {
    const obj = contentRef.current;
    if (!obj || !loaded) return;
    setWorldFitTarget(obj);
    onFit(obj);
  }, [loaded, onFit]);

  if (!loaded) return null;
  const doc = loaded.document;
  const primitives = doc.environment.primitives;

  return (
    <>
      {doc.environment.ground.plane ? <WorldGround /> : null}
      <group ref={contentRef} rotation-x={WORLD_TO_SCENE_X} name="world">
        {robots.map(([robotId, links], index) => (
          <group key={robotId} name={robotId}>
            {[...links.entries()].map(([name, visuals]) => (
              <group
                key={name}
                name={linkKey(robotId, name)}
                ref={(node) => {
                  const key = linkKey(robotId, name);
                  if (node) linkGroups.current.set(key, node);
                  else linkGroups.current.delete(key);
                }}
              >
                {visuals.map((visual, visualIndex) => (
                  <VisualOrigin
                    key={`${visual.link}:${visualIndex}`}
                    xyz={visual.xyz}
                    rpy={visual.rpy}
                  >
                    {visual.mesh.kind === "stl" ? (
                      <mesh
                        geometry={visual.mesh.geometry}
                        material={materials[index]}
                        scale={visual.scale}
                      />
                    ) : (
                      <ObjVisual
                        object={visual.mesh.object}
                        material={materials[index]!}
                        scale={visual.scale}
                      />
                    )}
                  </VisualOrigin>
                ))}
              </group>
            ))}
          </group>
        ))}
        {primitives.map((primitive) =>
          primitive.pose ? (
            <Body key={primitive.id} pose={primitive.pose}>
              <PrimitiveMesh
                primitive={primitive}
                material={primitiveMaterial}
              />
            </Body>
          ) : null
        )}
        {doc.boards.map((board) =>
          board.pose && finiteVec(board.size, 3) ? (
            <Body key={board.id} pose={board.pose}>
              <mesh material={boardMaterial}>
                <boxGeometry args={board.size as WorldVec3} />
              </mesh>
              <BoardLabel
                text={board.id}
                color={theme.text}
                z={board.size[2] / 2 + 0.008}
              />
            </Body>
          ) : null
        )}
      </group>
    </>
  );
}
