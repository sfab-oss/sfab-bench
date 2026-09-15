import {
  disambiguateSiblingNames,
  fileStemFromLabel,
  isRawPartName,
  occurrencePath,
  partDisplayName,
} from "./part-label";
import { filterPartTree, type PartTreeItem } from "./part-tree";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

expect(isRawPartName("=>[0:1:1:2]"), "occt dump");
expect(isRawPartName("=> [0:1:1:2]"), "occt dump with space");
expect(isRawPartName("0:1:1:2"), "tag path");
expect(isRawPartName(""), "empty");
expect(isRawPartName("   "), "whitespace");
expect(isRawPartName("o1.1"), "occurrence id fallback");
expect(isRawPartName("post_left") === false, "real name is not raw");
expect(isRawPartName("cube") === false, "stem is not raw");
expect(isRawPartName("1") === false, "bare digit is a name");

expect(occurrencePath("#o1.1") === "1.1", "hash ref");
expect(occurrencePath("o1.1.2") === "1.1.2", "bare id");
expect(occurrencePath("#o1.1.f6") === "1.1", "face suffix stripped");
expect(occurrencePath("#heading") === null, "not a cad ref");

expect(fileStemFromLabel("cube.step") === "cube", "step stem");
expect(fileStemFromLabel("a/b/plate.stp") === "plate", "path stem");

expect(
  partDisplayName({ name: "=>[0:1:1:2]", cadRef: "#o1.1" }, "#o1.1") === "Part 1.1",
  "raw dump falls back to ref path",
);
expect(
  partDisplayName({ name: "=>[0:1:1:2]", cadRef: "#o1.1" }, "#o1.1", "cube") === "cube",
  "sole solid uses the file stem",
);
expect(partDisplayName({ name: "0:1:1:2" }, "#o1") === "Part 1", "tag path fallback");
expect(partDisplayName({ name: "" }, "#o1.1.2") === "Part 1.1.2", "empty name");
expect(partDisplayName({ name: "o1.1" }, "#o1.1") === "Part 1.1", "id-as-name fallback");
expect(partDisplayName({ name: "post_left" }, "#o1.1.1") === "post_left", "real name passthrough");
expect(
  partDisplayName({ name: "plate_1" }, "#o1.1", "bracket_assembly") === "plate_1",
  "real name wins over stem",
);

const siblings = disambiguateSiblingNames([
  { key: "a", display: "Bolt", ref: "#o1.2" },
  { key: "b", display: "Bolt", ref: "#o1.3" },
  { key: "c", display: "Nut", ref: "#o1.4" },
]);
expect(siblings.get("a") === "Bolt (1.2)", "dup suffix from ref");
expect(siblings.get("b") === "Bolt (1.3)", "other dup suffix");
expect(siblings.get("c") === "Nut", "unique sibling unchanged");

const tree: PartTreeItem[] = [
  {
    key: "posts",
    rawName: "posts",
    displayName: "posts",
    children: [
      { key: "left", rawName: "post_left", displayName: "post_left", children: [] },
      { key: "right", rawName: "post_right", displayName: "post_right", children: [] },
    ],
  },
  { key: "plate", rawName: "plate_1", displayName: "plate_1", children: [] },
];

const nested = filterPartTree(tree, "post_left");
expect(nested.nodes.length === 1 && nested.nodes[0]?.key === "posts", "nested match keeps ancestor");
expect(nested.nodes[0]?.children.length === 1 && nested.nodes[0]?.children[0]?.key === "left", "only the hit child");
expect(nested.expandKeys.join(",") === "posts", "ancestor is auto-expanded");

const caseHit = filterPartTree(tree, "POST_LEFT");
expect(caseHit.nodes[0]?.children[0]?.key === "left", "filter is case-insensitive");

const rawHit = filterPartTree(
  [
    {
      key: "root",
      rawName: "=>[0:1:1:2]",
      displayName: "cube",
      children: [],
    },
  ],
  "=>[0:1:1:2]",
);
expect(rawHit.nodes.length === 1, "filter matches the raw name");

const parentHit = filterPartTree(tree, "posts");
expect(parentHit.nodes[0]?.children.length === 2, "self-hit keeps the full subtree");
expect(parentHit.expandKeys.join(",") === "posts", "self-hit with children is expanded");

const none = filterPartTree(tree, "nope");
expect(none.nodes.length === 0, "no-match");
expect(none.expandKeys.length === 0, "no-match expands nothing");

expect(filterPartTree(tree, "  ").nodes.length === 2, "blank query is a no-op");

console.log("part-label.selfcheck ok");
