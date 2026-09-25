import { reduceWorldSelection, worldStore } from "./world";

function expect(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

const link = { kind: "link" as const, robot: "arm", link: "upper_arm" };
const board = { kind: "board" as const, board: "uno" };
const links = [{ robot: "arm", link: "upper_arm" }];

let selection = reduceWorldSelection(null, {
  type: "select",
  selection: link,
});
expect(
  selection?.kind === "link" && selection.link === "upper_arm",
  "selects a link"
);
selection = reduceWorldSelection(selection, {
  type: "select",
  selection: board,
});
expect(
  selection?.kind === "board" && selection.board === "uno",
  "selects a board"
);

const keptBoard = reduceWorldSelection(selection, {
  type: "reload",
  links,
  boards: ["uno"],
});
expect(keptBoard === selection, "a reload that keeps the board keeps it");

const droppedBoard = reduceWorldSelection(selection, {
  type: "reload",
  links,
  boards: [],
});
expect(droppedBoard === null, "a reload that removes the board clears it");

const pickedLink = reduceWorldSelection(null, {
  type: "select",
  selection: link,
});
const keptLink = reduceWorldSelection(pickedLink, {
  type: "reload",
  links,
  boards: ["uno"],
});
expect(keptLink === pickedLink, "a reload that keeps the link keeps it");
const droppedLink = reduceWorldSelection(pickedLink, {
  type: "reload",
  links: [{ robot: "arm", link: "base" }],
  boards: ["uno"],
});
expect(droppedLink === null, "a reload that removes the link clears it");
expect(
  reduceWorldSelection(pickedLink, { type: "close" }) === null,
  "close clears a link"
);
expect(
  reduceWorldSelection(selection, { type: "close" }) === null,
  "close clears a board"
);
expect(
  reduceWorldSelection(null, {
    type: "select",
    selection: null,
  }) === null,
  "selecting nothing stays clear"
);

worldStore.getState().open("examples/arm/arm.world.json");
worldStore.getState().select(link);
expect(
  worldStore.getState().selection?.kind === "link",
  "the store selects a link"
);
worldStore.getState().close();
expect(worldStore.getState().selection === null, "the store clears on close");

worldStore.getState().open("examples/arm/arm.world.json");
worldStore.getState().select(board);
worldStore.getState().setOutline({
  robots: [
    {
      id: "arm",
      links: [{ name: "upper_arm", meshes: [], joint: null }],
    },
  ],
  boards: [{ id: "uno", chip: "atmega328p", firmware: "hold.hex" }],
});
expect(
  worldStore.getState().selection?.kind === "board",
  "the store keeps a board the reloaded outline still has"
);
worldStore.getState().setOutline({
  robots: [
    {
      id: "arm",
      links: [{ name: "base", meshes: [], joint: null }],
    },
  ],
  boards: [],
});
expect(
  worldStore.getState().selection === null,
  "the store clears a board the reloaded outline dropped"
);
worldStore.getState().close();

console.log("world-selection.selfcheck ok");
