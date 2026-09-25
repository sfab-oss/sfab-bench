import type { UrdfInfo } from "@sfab-bench/contract";

export type WorldOutlineJoint = {
  name: string;
  type: string;
  axis: [number, number, number] | null;
  /** Degrees. Set for a revolute joint that published a limit. */
  lowerDeg: number | null;
  upperDeg: number | null;
};

export type WorldOutlineLink = {
  name: string;
  meshes: string[];
  /** The joint whose child is this link. The root link has none. */
  joint: WorldOutlineJoint | null;
};

export type WorldOutlineBoard = {
  id: string;
  chip: string;
  firmware: string;
  source?: string;
};

export type WorldOutline = {
  robots: { id: string; links: WorldOutlineLink[] }[];
  boards: WorldOutlineBoard[];
};

export type WorldOutlineInput = {
  robots: readonly { id: string }[];
  boards: readonly {
    id: string;
    chip: string;
    firmware: string;
    source?: string;
  }[];
};

function revoluteDegrees(type: string, radians: number | null): number | null {
  if (type !== "revolute" || radians === null || !Number.isFinite(radians)) {
    return null;
  }
  return (radians * 180) / Math.PI;
}

/** Robots, the joint that moves each link, and boards. Pure. */
export function buildWorldOutline(
  world: WorldOutlineInput,
  urdfByRobot: Readonly<Record<string, UrdfInfo>>
): WorldOutline {
  return {
    robots: world.robots.map((robot) => {
      const info = urdfByRobot[robot.id];
      const links = info?.links ?? [];
      return {
        id: robot.id,
        links: links.map((name) => {
          const joint = info?.jointInfo.find((item) => item.child === name);
          return {
            name,
            meshes: info?.linkMeshes[name] ?? [],
            joint: joint
              ? {
                  name: joint.name,
                  type: joint.type,
                  axis: joint.axis,
                  lowerDeg: revoluteDegrees(joint.type, joint.lower),
                  upperDeg: revoluteDegrees(joint.type, joint.upper),
                }
              : null,
          };
        }),
      };
    }),
    boards: world.boards.map((board) => ({
      id: board.id,
      chip: board.chip,
      firmware: board.firmware,
      ...(board.source ? { source: board.source } : {}),
    })),
  };
}

export function outlineItems(outline: WorldOutline): {
  links: { robot: string; link: string }[];
  boards: string[];
} {
  const links: { robot: string; link: string }[] = [];
  for (const robot of outline.robots) {
    for (const link of robot.links) {
      links.push({ robot: robot.id, link: link.name });
    }
  }
  return { links, boards: outline.boards.map((board) => board.id) };
}

/** Trimmed degrees for a joint limit. */
export function formatDegrees(degrees: number): string {
  const rounded = Math.round(degrees * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** One decimal, so a live joint angle can move without jumping format. */
export function formatLiveDegrees(radians: number): string {
  const degrees = (radians * 180) / Math.PI;
  return (Math.round(degrees * 10) / 10).toFixed(1);
}
