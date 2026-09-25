import { extractUrdfJointsAndMeshes } from "@sfab-bench/contract";

import {
  buildWorldOutline,
  formatDegrees,
  formatLiveDegrees,
} from "./world-outline";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

const arm = extractUrdfJointsAndMeshes(`
<robot name="arm">
  <link name="base">
    <visual><geometry><mesh filename="meshes/base.stl"/></geometry></visual>
  </link>
  <link name="upper_arm">
    <visual><geometry><mesh filename="meshes/upper_arm.stl"/></geometry></visual>
  </link>
  <joint name="shoulder" type="revolute">
    <parent link="base"/>
    <child link="upper_arm"/>
    <axis xyz="0 0 1"/>
    <limit lower="0" upper="2.617993877991494"/>
  </joint>
</robot>`);

const gripper = extractUrdfJointsAndMeshes(`
<robot name="gripper">
  <link name="palm">
    <visual><geometry><mesh filename="palm.obj"/></geometry></visual>
  </link>
  <link name="finger">
    <visual><geometry><mesh filename="finger.stl"/></geometry></visual>
  </link>
  <joint name="jaw" type="prismatic">
    <parent link="palm"/>
    <child link="finger"/>
    <axis xyz="1 0 0"/>
    <limit lower="0" upper="0.02"/>
  </joint>
</robot>`);

const outline = buildWorldOutline(
  {
    robots: [{ id: "arm" }, { id: "gripper" }],
    boards: [
      {
        id: "uno",
        chip: "atmega328p",
        firmware: "firmware/hold/hold.hex",
        source: "firmware/hold/hold.ino",
      },
    ],
  },
  { arm, gripper }
);

expect(
  outline.robots.map((robot) => robot.id).join(",") === "arm,gripper",
  "two robots"
);
expect(
  outline.boards.length === 1 && outline.boards[0]?.id === "uno",
  "one board"
);
expect(outline.boards[0]?.chip === "atmega328p", "board chip");
expect(
  outline.boards[0]?.firmware === "firmware/hold/hold.hex",
  "firmware path"
);
expect(outline.boards[0]?.source === "firmware/hold/hold.ino", "source path");

const base = outline.robots[0]?.links.find((link) => link.name === "base");
const upper = outline.robots[0]?.links.find(
  (link) => link.name === "upper_arm"
);
expect(base?.joint === null, "the root link has no parent joint");
expect(base?.meshes.join(",") === "meshes/base.stl", "base mesh");
expect(upper?.joint?.name === "shoulder", "shoulder moves the upper arm");
expect(upper?.joint?.type === "revolute", "shoulder is revolute");
expect(upper?.joint?.axis?.join(" ") === "0 0 1", "shoulder axis");
expect(upper?.meshes.join(",") === "meshes/upper_arm.stl", "upper arm mesh");
const shoulder = upper?.joint;
if (!shoulder) throw new Error("shoulder joint missing");
expect(
  shoulder.lowerDeg !== null && Math.abs(shoulder.lowerDeg) < 1e-6,
  "lower limit is 0°"
);
expect(
  shoulder.upperDeg !== null && Math.abs(shoulder.upperDeg - 150) < 1e-6,
  `upper limit is 150°, got ${shoulder.upperDeg}`
);
expect(
  shoulder.upperDeg !== null && formatDegrees(shoulder.upperDeg) === "150",
  "150° formats"
);

const finger = outline.robots[1]?.links.find((link) => link.name === "finger");
const palm = outline.robots[1]?.links.find((link) => link.name === "palm");
expect(palm?.joint === null, "gripper root");
expect(finger?.joint?.name === "jaw", "jaw moves the finger");
expect(finger?.joint?.type === "prismatic", "jaw is prismatic");
expect(
  finger?.joint?.lowerDeg === null && finger?.joint?.upperDeg === null,
  "prismatic limits stay out of degrees"
);
expect(finger?.meshes.join(",") === "finger.stl", "finger mesh");
expect(formatLiveDegrees(Math.PI / 2) === "90.0", "a right angle is 90.0");

console.log("world-outline.selfcheck ok");
