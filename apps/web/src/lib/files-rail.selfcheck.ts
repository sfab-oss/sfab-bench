import {
  catalogEmptyReason,
  defaultExpandedDirPaths,
  filesRailShortcutLabel,
  filesRailToggleTitle,
  isEditableTarget,
  isMacPlatform,
  pruneFileTreeProjects,
  readFileTreeExpansion,
  resolvedExpandedDirs,
  serializeFileTreeExpansion,
  shouldReloadOpenFile,
  upsertFileTreeProject,
  type FileTreeProjectExpansion,
} from "./files-rail";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

expect(isMacPlatform("MacIntel"), "mac platform");
expect(isMacPlatform("Win32", "Mozilla/5.0") === false, "windows is not mac");
expect(filesRailShortcutLabel(true) === "⌘B", "mac chord");
expect(filesRailShortcutLabel(false) === "Ctrl+B", "other chord");
expect(filesRailToggleTitle(true, "show") === "Show files (⌘B)", "show title");
expect(filesRailToggleTitle(false) === "Toggle files (Ctrl+B)", "toggle title");

expect(isEditableTarget({ tagName: "INPUT" }), "input is editable");
expect(isEditableTarget({ tagName: "TEXTAREA" }), "textarea is editable");
expect(isEditableTarget({ tagName: "SELECT" }), "select is editable");
expect(isEditableTarget({ tagName: "DIV", isContentEditable: true }), "contenteditable root");
expect(
  isEditableTarget({
    tagName: "P",
    isContentEditable: false,
    closest: (sel: string) => (sel.includes("contenteditable") ? { tagName: "DIV" } : null),
  }),
  "nested tiptap node",
);
expect(isEditableTarget({ tagName: "BUTTON" }) === false, "button is not editable");
expect(
  isEditableTarget({ tagName: "BUTTON" }, { tagName: "DIV", isContentEditable: true }),
  "active composer still counts",
);
expect(isEditableTarget(null, null) === false, "nothing focused");

expect(catalogEmptyReason({ fileCount: 0, listedCount: 0, treeCount: 0, kind: "all" }).type === "no-cad", "empty folder");
expect(catalogEmptyReason({ fileCount: 3, listedCount: 0, treeCount: 0, kind: "glb" }).type === "kind", "kind trap");
expect(catalogEmptyReason({ fileCount: 3, listedCount: 0, treeCount: 0, kind: "step" }).type === "kind", "step trap");
expect(catalogEmptyReason({ fileCount: 3, listedCount: 2, treeCount: 0, kind: "all" }).type === "search", "search miss");
expect(catalogEmptyReason({ fileCount: 3, listedCount: 2, treeCount: 2, kind: "all" }).type === "ready", "has rows");
expect(
  catalogEmptyReason({ fileCount: 3, listedCount: 0, treeCount: 0, kind: "glb" }).type === "kind",
  "kind wins over a leftover search",
);

expect(shouldReloadOpenFile("a.step", "a.step", false) === false, "re-click is a no-op");
expect(shouldReloadOpenFile("a.step", "a.step", true), "error row retries");
expect(shouldReloadOpenFile("b.step", "a.step", false), "other file opens");

expect(
  defaultExpandedDirPaths(["cad", "out"], ["cad", "cad/exports"]).join(",") === "cad,out,cad/exports",
  "seed is depth-1 plus ancestors",
);

const older: FileTreeProjectExpansion = {
  path: "/abs/path/old",
  expanded: ["cad"],
  seen: ["cad"],
  updatedAt: 1,
};
const newer: FileTreeProjectExpansion = {
  path: "/abs/path/new",
  expanded: [],
  seen: ["cad"],
  updatedAt: 100,
};
const pruned = pruneFileTreeProjects(
  [
    older,
    ...Array.from({ length: 19 }, (_, i) => ({
      path: `/abs/path/p${i}`,
      expanded: [] as string[],
      seen: [] as string[],
      updatedAt: 2 + i,
    })),
    newer,
  ],
  20,
);
expect(pruned.length === 20, `cap 20, got ${pruned.length}`);
expect(pruned[0]?.path === "/abs/path/new", "most recent first");
expect(pruned.some((row) => row.path === "/abs/path/old") === false, "oldest dropped");

const upserted = upsertFileTreeProject(
  [older, newer],
  { path: "/abs/path/old", expanded: [], seen: ["cad"], updatedAt: 200 },
  20,
);
expect(upserted[0]?.path === "/abs/path/old", "touched project moves to front");
expect(upserted[0]?.expanded.length === 0, "collapse-all is stored");

const firstVisit = resolvedExpandedDirs(undefined, ["cad", "out"], ["cad", "out", "cad/exports"]);
expect(firstVisit.sort().join(",") === "cad,out", "first visit uses today's seed");

const collapsed = resolvedExpandedDirs(
  { path: "/abs/path/proj", expanded: [], seen: ["cad", "out"], updatedAt: 1 },
  ["cad", "out", "fresh"],
  ["cad", "out", "fresh"],
);
expect(collapsed.sort().join(",") === "fresh", "new dirs still get the default; collapse-all stays");

const gone = resolvedExpandedDirs(
  { path: "/abs/path/proj", expanded: ["cad", "missing"], seen: ["cad", "missing"], updatedAt: 1 },
  ["cad"],
  ["cad"],
);
expect(gone.join(",") === "cad", "dropped dirs leave the expanded set");

const roundTrip = readFileTreeExpansion(
  serializeFileTreeExpansion([{ path: "/abs/path/proj", expanded: ["cad"], seen: ["cad", "out"], updatedAt: 3 }]),
);
expect(roundTrip.length === 1 && roundTrip[0]?.expanded[0] === "cad", "storage round-trip");
expect(readFileTreeExpansion("not-json").length === 0, "bad json is empty");
expect(readFileTreeExpansion(null).length === 0, "missing storage is empty");

console.log("files-rail.selfcheck ok");
