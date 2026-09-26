/** Ported from layered-sim E7 (318b899). */

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PART_FORMAT,
  type PartFile,
  type Pose,
  type WorldFileV2,
} from "@sfab-bench/contract";

type V1Pose = {
  position: [number, number, number];
  rotation: [number, number, number, number];
};

type V1World = {
  version: number;
  robots: { id: string; urdf: string; pose: V1Pose }[];
  environment: {
    ground: { plane: boolean };
    primitives?: unknown[];
    stepProps?: unknown[];
  };
  boards: {
    id: string;
    chip: string;
    board: string;
    firmware: string;
    source?: string;
    pose: V1Pose;
  }[];
  supplies: {
    id: string;
    voltage: number;
    currentLimit: number;
    rSeries: number;
  }[];
  parts: {
    id: string;
    model: string;
    drives?: { robot: string; joint: string };
  }[];
  wires: [string, string][];
};

const GRAVITY: [number, number, number] = [0, 0, -9.80665];
const ARM_URDF = "robot/arm.urdf";
const ARM_PART = "sfab/arm@1.0.0";
const UNO_PART = "sfab/uno-r3@1.0.0";
const USB_PART = "sfab/usb-port-500ma@1.0.0";
const BENCH_PART = "sfab/bench-supply@1.0.0";
const SG90_PART = "sfab/sg90@1.0.0";

function poseOf(pose: V1Pose): Pose {
  return {
    position: [...pose.position],
    rotation: [...pose.rotation],
  };
}

function relPosix(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join("/");
}

function jointParent(urdfXml: string, joint: string): string {
  const re = new RegExp(
    `<joint\\s+name="${joint}"[\\s\\S]*?<parent\\s+link="([^"]+)"`
  );
  const match = urdfXml.match(re);
  if (!match?.[1]) throw new Error(`joint ${joint} not found in urdf`);
  return match[1];
}

export function scenePartId(worldName: string): string {
  return `sfab/${worldName}-scene@1.0.0`;
}

export function convertV1(
  v1: V1World,
  v1Dir: string,
  assetRoot: string,
  worldName: string
): { world: WorldFileV2; part: PartFile } {
  if (v1.version !== 1) throw new Error(`expected v1, got ${v1.version}`);
  const instances: Record<
    string,
    {
      part: string;
      pose?: Pose;
      params?: Record<string, number | string | boolean>;
    }
  > = {};
  const wires: [string, string][] = v1.wires.map((wire) => [wire[0], wire[1]]);

  for (const robot of v1.robots) {
    if (robot.urdf !== ARM_URDF) {
      throw new Error(`no part for urdf ${robot.urdf}`);
    }
    instances[robot.id] = { part: ARM_PART, pose: poseOf(robot.pose) };
  }
  for (const board of v1.boards) {
    if (board.board !== "uno" || board.chip !== "atmega328p") {
      throw new Error(`no part for board ${board.board} chip ${board.chip}`);
    }
    const params: Record<string, string> = {
      firmware: relPosix(assetRoot, path.resolve(v1Dir, board.firmware)),
    };
    if (board.source) {
      params.source = relPosix(assetRoot, path.resolve(v1Dir, board.source));
    }
    instances[board.id] = { part: UNO_PART, pose: poseOf(board.pose), params };
  }
  for (const supply of v1.supplies) {
    if (
      supply.voltage === 5 &&
      supply.currentLimit === 0.9 &&
      supply.rSeries === 0.5
    ) {
      instances[supply.id] = { part: USB_PART };
      continue;
    }
    if (supply.rSeries === 0.05) {
      instances[supply.id] = {
        part: BENCH_PART,
        params: { V: supply.voltage, Ilimit: supply.currentLimit },
      };
      continue;
    }
    throw new Error(
      `no supply part for ${supply.voltage} V, ${supply.currentLimit} A, ${supply.rSeries} ohm`
    );
  }
  for (const part of v1.parts) {
    if (part.model !== "sg90")
      throw new Error(`no part for model ${part.model}`);
    instances[part.id] = { part: SG90_PART };
    if (part.drives) {
      const robot = v1.robots.find((entry) => entry.id === part.drives?.robot);
      if (!robot) throw new Error(`drives robot ${part.drives.robot} missing`);
      const urdfAbs = path.resolve(v1Dir, robot.urdf);
      const parent = jointParent(
        readFileSync(urdfAbs, "utf8"),
        part.drives.joint
      );
      wires.push(
        [`${part.id}.shaft`, `${part.drives.robot}.${part.drives.joint}`],
        [`${part.id}.mount`, `${part.drives.robot}.${parent}`]
      );
    }
  }

  const partFile: PartFile = {
    format: PART_FORMAT,
    id: scenePartId(worldName),
    type: "assembly",
    foreign: false,
    axes: {
      behaviour: {
        "2": {
          default: "netlist",
          variants: {
            netlist: {
              kind: "composite",
              omits: ["no snapshot of this assembly"],
              netlist: { instances, wires, expose: {} },
            },
          },
        },
      },
      body: {
        "0": {
          default: "none",
          variants: {
            none: { kind: "none", omits: ["assembly adds no body"] },
          },
        },
      },
      visual: {
        "0": {
          default: "none",
          variants: {
            none: { kind: "none", omits: ["assembly adds no visual"] },
          },
        },
      },
    },
  };

  const environment: WorldFileV2["environment"] = {
    ground: { plane: v1.environment.ground.plane },
    gravity: GRAVITY,
  };
  if (v1.environment.primitives)
    environment.primitives = v1.environment.primitives;
  if (v1.environment.stepProps)
    environment.stepProps = v1.environment.stepProps;

  const world: WorldFileV2 = {
    version: 2,
    environment,
    run: { seed: 1, levels: { default: 1 } },
    root: { id: "scene", part: partFile.id },
  };
  return { world, part: partFile };
}

export function convertV1File(
  v1File: string,
  assetRoot: string,
  worldName: string
): { world: WorldFileV2; part: PartFile } {
  const v1 = JSON.parse(readFileSync(v1File, "utf8")) as V1World;
  return convertV1(v1, path.dirname(v1File), assetRoot, worldName);
}
