import { Container } from "@react-three/uikit";
import { useFrame } from "@react-three/fiber";
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { PRESSED, ToolBtn } from "@/xr/ui/ToolBtn";
import { useWorldCard } from "@/xr/ui/WorldCard";
import {
  CARD_R,
  CORNER_LAYOUT,
  EDGE_LAYOUT,
  GAP,
  HANDLE_DROP,
  HANDLE_EXP_LEN,
  HANDLE_EXP_R,
  HANDLE_LEN,
  HANDLE_R,
  HIT_PAD,
  NEAR_PAD,
  PX,
  STROKE,
  bandWidth,
  cardMeters,
  classify,
  clampSize,
  cornerStrokeGeometry,
  handleCenterY,
  rayOnCard,
  registerCard,
  roundedRectGeometry,
  visibleRaycast,
  stadiumGeometry,
  type CornerId,
  type EdgeId,
  type Region,
} from "@/xr/ui/chrome";

const HOVER = "#e4e4e7";
const HANDLE_IDLE = "#d4d4d8";
const CORNER_STROKE = cornerStrokeGeometry();
const HANDLE_GEOM = stadiumGeometry(HANDLE_LEN, HANDLE_R);
const HANDLE_EXP_GEOM = stadiumGeometry(HANDLE_EXP_LEN, HANDLE_EXP_R);

type HandleChrome = { keepOpen: () => void; maybeClose: () => void };
const HandleContext = createContext<HandleChrome | null>(null);

export function HandleButton({
  onHover,
  ...props
}: Omit<Parameters<typeof ToolBtn>[0], "round" | "grow">) {
  const ctx = useContext(HandleContext);
  if (!ctx) throw new Error("HandleButton must be used within WorldCard handle");
  return (
    <ToolBtn
      {...props}
      round
      grow={false}
      backgroundColor={HOVER}
      hoverColor={HANDLE_IDLE}
      onHover={(h) => {
        if (h) ctx.keepOpen();
        else ctx.maybeClose();
        onHover?.(h);
      }}
    />
  );
}

const CORNER_SIGN: Record<CornerId, { sx: number; sy: number }> = {
  tr: { sx: 1, sy: 1 },
  tl: { sx: -1, sy: 1 },
  bl: { sx: -1, sy: -1 },
  br: { sx: 1, sy: -1 },
};

/**
 * Drag reads only refs. Region is locked at pointer-down. Do not put
 * onSizeChange / size / camera in a useEffect dependency that runs during
 * a drag — that is the first-tick abort bug.
 */
type Drag =
  | {
      kind: "resize";
      region: Region;
      corner: CornerId;
      sx: number;
      sy: number;
      startW: number;
      startH: number;
      localX: number;
      localY: number;
    }
  | { kind: "move"; region: Region };

export function CardChrome({
  shape = "card",
  radius = 0,
  corners = true,
  edges = ["t", "l", "r"],
  handle = false,
}: {
  shape?: "card" | "orb";
  radius?: number;
  corners?: boolean;
  edges?: readonly EdgeId[];
  handle?: boolean | ReactNode;
}) {
  const {
    anchor,
    size,
    limits,
    setSize,
    setDragging,
    startMove,
    dragMove,
    startMoveAt,
    moveTo,
    endMove,
    feedback,
    notifyDragStart,
    notifyDragEnd,
  } = useWorldCard();
  const meters = cardMeters(size);
  const hw = meters.w / 2;
  const hh = meters.h / 2;
  const outer = bandWidth(HIT_PAD);
  const hasHandle = handle === true || (handle != null && handle !== false);
  const handleKids = typeof handle === "boolean" ? null : handle;
  const opts = { shape, radius, corners, edges, handle: hasHandle };

  const sizeRef = useRef(size);
  sizeRef.current = size;
  const limitsRef = useRef(limits);
  limitsRef.current = limits;
  const setSizeRef = useRef(setSize);
  setSizeRef.current = setSize;
  const setDraggingRef = useRef(setDragging);
  setDraggingRef.current = setDragging;
  const startMoveRef = useRef(startMove);
  startMoveRef.current = startMove;
  const dragMoveRef = useRef(dragMove);
  dragMoveRef.current = dragMove;
  const startMoveAtRef = useRef(startMoveAt);
  startMoveAtRef.current = startMoveAt;
  const moveToRef = useRef(moveTo);
  moveToRef.current = moveTo;
  const endMoveRef = useRef(endMove);
  endMoveRef.current = endMove;
  const notifyStartRef = useRef(notifyDragStart);
  notifyStartRef.current = notifyDragStart;
  const notifyEndRef = useRef(notifyDragEnd);
  notifyEndRef.current = notifyDragEnd;
  const localScratch = useRef(new THREE.Vector3());
  const feedbackRef = useRef(feedback);
  feedbackRef.current = feedback;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const drag = useRef<Drag | null>(null);
  const hover = useRef<Region>("none");
  const strokes = useRef(new Map<Region, THREE.Mesh>());
  const expandT = useRef(0);
  const idleVis = useRef<THREE.Mesh>(null);
  const expVis = useRef<THREE.Group>(null);
  const btnVis = useRef<THREE.Group>(null);
  const collapse = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleOpen = useRef(false);

  const keepOpen = () => {
    if (collapse.current) clearTimeout(collapse.current);
    collapse.current = null;
    handleOpen.current = true;
  };
  const maybeClose = () => {
    if (drag.current?.region === "handle") return;
    if (collapse.current) clearTimeout(collapse.current);
    collapse.current = setTimeout(() => {
      handleOpen.current = false;
    }, 120);
  };

  const beginResizeAt = (corner: CornerId, localX: number, localY: number) => {
    if (drag.current) return;
    const { sx, sy } = CORNER_SIGN[corner];
    const s = sizeRef.current;
    drag.current = {
      kind: "resize",
      region: `corner:${corner}`,
      corner,
      sx,
      sy,
      startW: s.w,
      startH: s.h,
      localX,
      localY,
    };
    setDraggingRef.current(true);
    feedbackRef.current.click();
    show(`corner:${corner}`, true, true);
    notifyStartRef.current(`corner:${corner}`);
  };

  const resizeToLocal = (localX: number, localY: number) => {
    const d = drag.current;
    if (!d || d.kind !== "resize") return;
    const lim = limitsRef.current;
    const next = clampSize(
      d.startW + (2 * d.sx * (localX - d.localX)) / PX,
      d.startH + (2 * d.sy * (localY - d.localY)) / PX,
      lim.minW,
      lim.minH,
      lim.maxW,
      lim.maxH,
    );
    const cur = sizeRef.current;
    if (next.w !== cur.w || next.h !== cur.h) setSizeRef.current(next);
  };

  const endChrome = (ev?: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    const region = d.region;
    if (d.kind === "resize") {
      const cap = ev?.target as { releasePointerCapture?: (id: number) => void } | null;
      if (ev) cap?.releasePointerCapture?.(ev.pointerId);
      drag.current = null;
      setDraggingRef.current(false);
    } else {
      drag.current = null;
      endMoveRef.current(ev);
    }
    notifyEndRef.current(region);
    show(region, hover.current === region, false);
    if (region === "handle" && hover.current !== "handle") maybeClose();
  };

  useEffect(() => {
    const a = anchor.current;
    if (!a) return;
    const off = registerCard({
      anchor: a,
      size: () => sizeRef.current,
      opts: () => optsRef.current,
      hover: (on, world) => {
        if (!on) {
          setHover("none");
          return;
        }
        if (!world) return;
        a.worldToLocal(localScratch.current.copy(world));
        const s = sizeRef.current;
        setHover(
          classify(localScratch.current.x, localScratch.current.y, s.w, s.h, NEAR_PAD, optsRef.current),
        );
      },
      begin: (world) => {
        a.worldToLocal(localScratch.current.copy(world));
        const s = sizeRef.current;
        const region = classify(
          localScratch.current.x,
          localScratch.current.y,
          s.w,
          s.h,
          NEAR_PAD,
          optsRef.current,
        );
        if (region.startsWith("corner:")) {
          beginResizeAt(region.slice(7) as CornerId, localScratch.current.x, localScratch.current.y);
          return;
        }
        if (region.startsWith("edge:") || region === "handle" || region === "ring") {
          startMoveAtRef.current(world);
          drag.current = { kind: "move", region };
          show(region, true, true);
          notifyStartRef.current(region);
          if (region === "handle") keepOpen();
        }
      },
      update: (world) => {
        const d = drag.current;
        if (d?.kind === "resize") {
          a.worldToLocal(localScratch.current.copy(world));
          resizeToLocal(localScratch.current.x, localScratch.current.y);
          return;
        }
        if (d?.kind === "move") moveToRef.current(world);
      },
      end: () => endChrome(),
    });
    return () => {
      off();
      if (drag.current) endChrome();
    };
  }, [anchor]);

  const orbOuter = radius + outer;
  const orbDisc = useMemo(() => new THREE.CircleGeometry(Math.max(orbOuter, 0.001), 48), [orbOuter]);
  const orbRing = useMemo(
    () =>
      new THREE.RingGeometry(
        Math.max(radius + GAP - STROKE / 2, 0.0001),
        radius + GAP + STROKE / 2,
        48,
      ),
    [radius],
  );
  const bandGeom = useMemo(
    () => roundedRectGeometry(hw + outer, hh + outer, CARD_R + outer, hasHandle ? HANDLE_DROP : 0),
    [hw, hh, outer, hasHandle],
  );
  const inset = CARD_R + 0.024 + 0.012;
  const hLen = Math.max(meters.w - 2 * inset, 0.01);
  const vLen = Math.max(meters.h - 2 * inset, 0.01);
  const hStroke = useMemo(() => stadiumGeometry(hLen, STROKE / 2), [hLen]);
  const vStroke = useMemo(() => stadiumGeometry(vLen, STROKE / 2), [vLen]);
  useEffect(() => () => orbDisc.dispose(), [orbDisc]);
  useEffect(() => () => orbRing.dispose(), [orbRing]);
  useEffect(() => () => bandGeom.dispose(), [bandGeom]);
  useEffect(() => () => hStroke.dispose(), [hStroke]);
  useEffect(() => () => vStroke.dispose(), [vStroke]);

  const paint = (region: Region, on: boolean, pressed = false) => {
    const color = pressed ? PRESSED.backgroundColor : HOVER;
    if (region === "handle") {
      const idle = idleVis.current;
      if (idle && "color" in idle.material && idle.material.color instanceof THREE.Color) {
        idle.material.color.set(pressed ? PRESSED.backgroundColor : on ? HOVER : HANDLE_IDLE);
      }
      return;
    }
    const mesh = strokes.current.get(region);
    if (!mesh) return;
    mesh.visible = on;
    const mat = mesh.material;
    if (mat && "color" in mat && mat.color instanceof THREE.Color) {
      mat.color.set(color);
    }
  };

  const show = (region: Region, on: boolean, pressed = false) => {
    paint(region, on, pressed);
  };

  const setHover = (region: Region) => {
    if (hover.current === region) return;
    if (hover.current !== "none") {
      show(hover.current, false);
      feedbackRef.current.hover(hover.current, false);
      if (hover.current === "handle") maybeClose();
    }
    hover.current = region;
    if (region !== "none") {
      show(region, true);
      feedbackRef.current.hover(region, true);
      if (region === "handle") keepOpen();
    }
  };

  const bindStroke = (region: Region) => (node: THREE.Mesh | null) => {
    if (node) strokes.current.set(region, node);
    else strokes.current.delete(region);
  };

  const beginResize = (corner: CornerId, ev: ThreeEvent<PointerEvent>) => {
    const a = anchor.current;
    if (!a || drag.current) return;
    const local = rayOnCard(a, ev.ray);
    if (!local) return;
    const cap = ev.target as { setPointerCapture?: (id: number) => void } | null;
    cap?.setPointerCapture?.(ev.pointerId);
    beginResizeAt(corner, local.x, local.y);
  };

  const onDown = (ev: ThreeEvent<PointerEvent>) => {
    const a = anchor.current;
    if (!a || drag.current) return;
    ev.stopPropagation();
    const local = rayOnCard(a, ev.ray);
    if (!local) return;
    const region = classify(local.x, local.y, sizeRef.current.w, sizeRef.current.h, HIT_PAD, optsRef.current);
    if (region.startsWith("corner:") && corners) {
      beginResize(region.slice(7) as CornerId, ev);
      return;
    }
    if (region.startsWith("edge:") || region === "handle" || region === "ring") {
      startMoveRef.current(ev);
      drag.current = { kind: "move", region };
      show(region, true, true);
      notifyStartRef.current(region);
      if (region === "handle") keepOpen();
      return;
    }
  };

  const onMove = (ev: ThreeEvent<PointerEvent>) => {
    const a = anchor.current;
    if (!a) return;
    const d = drag.current;
    if (d?.kind === "resize") {
      ev.stopPropagation();
      const local = rayOnCard(a, ev.ray);
      if (!local) return;
      resizeToLocal(local.x, local.y);
      return;
    }
    if (d?.kind === "move") {
      dragMoveRef.current(ev);
      return;
    }
    const local = rayOnCard(a, ev.ray);
    if (!local) {
      setHover("none");
      return;
    }
    setHover(classify(local.x, local.y, sizeRef.current.w, sizeRef.current.h, HIT_PAD, optsRef.current));
  };

  const onUp = (ev: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    ev.stopPropagation();
    endChrome(ev);
  };

  const onOut = (ev: ThreeEvent<PointerEvent>) => {
    if (drag.current) return;
    const a = anchor.current;
    if (!a) {
      setHover("none");
      return;
    }
    const local = rayOnCard(a, ev.ray);
    if (local) {
      const region = classify(local.x, local.y, sizeRef.current.w, sizeRef.current.h, HIT_PAD, optsRef.current);
      if (region === "handle" || region === hover.current) return;
      setHover(region);
      return;
    }
    setHover("none");
  };

  const edgeAlong = (id: EdgeId) => (id === "t" ? hh : hw);
  const pillY = handleCenterY(hh);

  useFrame((_, dt) => {
    if (!hasHandle) return;
    const goal = handleOpen.current || drag.current?.region === "handle" ? 1 : 0;
    expandT.current += (goal - expandT.current) * Math.min(1, 10 * dt);
    const t = expandT.current;
    if (idleVis.current) idleVis.current.visible = t < 0.2;
    if (expVis.current) {
      expVis.current.visible = t > 0.05;
      expVis.current.scale.set(
        THREE.MathUtils.lerp(HANDLE_LEN / HANDLE_EXP_LEN, 1, t),
        THREE.MathUtils.lerp(HANDLE_R / HANDLE_EXP_R, 1, t),
        1,
      );
    }
    if (btnVis.current) btnVis.current.visible = t > 0.88;
  });

  if (shape === "orb") {
    return (
      <group name="card-chrome-orb">
        <mesh
          position={[0, 0, -0.001]}
          raycast={visibleRaycast}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerOut={onOut}
        >
          <primitive attach="geometry" object={orbDisc} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={bindStroke("ring")} visible={false} position={[0, 0, 0.003]} raycast={() => {}}>
          <primitive attach="geometry" object={orbRing} />
          <meshBasicMaterial color={HOVER} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  }

  return (
    <HandleContext.Provider value={{ keepOpen, maybeClose }}>
    <group name="card-chrome">
      <mesh
        position={[0, 0, -0.001]}
        raycast={visibleRaycast}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerOut={onOut}
      >
        <primitive attach="geometry" object={bandGeom} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {corners
        ? CORNER_LAYOUT.map((c) => (
            <group key={c.id} position={[c.sx * hw, c.sy * hh, 0.003]} rotation={[0, 0, c.rot]}>
              <mesh ref={bindStroke(`corner:${c.id}`)} visible={false} raycast={() => {}}>
                <primitive attach="geometry" object={CORNER_STROKE} />
                <meshBasicMaterial color={HOVER} />
              </mesh>
            </group>
          ))
        : null}
      {EDGE_LAYOUT.filter((e) => edges.includes(e.id)).map((e) => {
        const horiz = e.id === "t";
        return (
          <group key={e.id} position={[0, 0, 0.003]} rotation={[0, 0, e.rot]}>
            <group position={[0, edgeAlong(e.id) + GAP, 0]}>
              <mesh ref={bindStroke(`edge:${e.id}`)} visible={false} raycast={() => {}}>
                <primitive attach="geometry" object={horiz ? hStroke : vStroke} />
                <meshBasicMaterial color={HOVER} />
              </mesh>
            </group>
          </group>
        );
      })}
      {hasHandle ? (
        <group name="card-handle" position={[0, pillY, 0.002]}>
          <mesh ref={idleVis} raycast={() => {}}>
            <primitive attach="geometry" object={HANDLE_GEOM} />
            <meshBasicMaterial color={HANDLE_IDLE} />
          </mesh>
          <group ref={expVis} visible={false}>
            <mesh raycast={() => {}}>
              <primitive attach="geometry" object={HANDLE_EXP_GEOM} />
              <meshBasicMaterial color={HOVER} />
            </mesh>
          </group>
          <mesh
            position={[0, 0, 0.003]}
            raycast={visibleRaycast}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerOut={onOut}
          >
            <primitive attach="geometry" object={HANDLE_EXP_GEOM} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          {handleKids ? (
            <group ref={btnVis} visible={false} position={[0, 0, 0.004]}>
              <Container
                pixelSize={0.001}
                width={HANDLE_EXP_LEN / PX}
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                pointerEvents="auto"
              >
                {handleKids}
              </Container>
            </group>
          ) : null}
        </group>
      ) : null}
    </group>
    </HandleContext.Provider>
  );
}
