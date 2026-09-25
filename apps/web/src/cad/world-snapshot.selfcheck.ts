import type { WorldState } from "@sfab-bench/contract";

import { viewerSnapshot } from "@/cad/viewer-snapshot";
import { setWorldLiveState, worldStore } from "@/state/world";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

const live: WorldState = {
  simTime: 12.345,
  playing: true,
  poses: {},
  joints: {},
  boards: { uno: { running: true } },
};

worldStore.setState({
  path: "examples/arm/arm.world.json",
  playing: false,
  simTime: 0,
});
setWorldLiveState(live);

const open = viewerSnapshot();
expect(open.file === "examples/arm/arm.world.json", "world path is the file");
expect(open.empty === false, "an open world is not an empty CAD view");
expect(open.playing === true, "playing comes from the live run");
expect(open.simTime === 12.345, "simTime comes from the live run");
expect(open.tree.length === 0 && open.partCount === 0, "no CAD tree");
expect(open.selected === null, "selection stays off the snapshot");

worldStore.getState().close();
setWorldLiveState(null);
const closed = viewerSnapshot();
expect(closed.file === "", "closing the world clears the snapshot file");
expect(closed.playing === undefined, "a CAD snapshot has no playing");
expect(closed.simTime === undefined, "a CAD snapshot has no simTime");

console.log("world-snapshot.selfcheck ok");
