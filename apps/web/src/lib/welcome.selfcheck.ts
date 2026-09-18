import {
  browseListingApply,
  CAD_SKILL_URL,
  documentTitle,
  emptySceneKind,
  fileRecentLines,
  normalizeDirPath,
  openFolderButtonTitle,
  openFolderShortcutLabel,
  PRODUCT_TITLE,
  pathFieldEnterAction,
  STARTER_REPO_URL,
} from "./welcome";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

expect(PRODUCT_TITLE === "sfab-bench", "brand matches index.html");
expect(documentTitle({}) === "sfab-bench", "welcome title");
expect(
  documentTitle({ folderName: "cad" }) === "cad — sfab-bench",
  "folder tab"
);
expect(
  documentTitle({ folderName: "cad", fileName: "cube.step" }) ===
    "cube.step — cad — sfab-bench",
  "file tab"
);
expect(
  documentTitle({ folderName: "  ", fileName: "  " }) === "sfab-bench",
  "blank names"
);
expect(
  documentTitle({ fileName: "cube.step" }) === "cube.step — sfab-bench",
  "file without folder"
);

const idle = {
  hasReview: false,
  progress: null,
  loadError: false,
  sceneCrash: false,
  projectPath: "",
  treeOpen: true,
  catalogReady: true,
  hasCad: false,
  folderGone: false,
};
expect(emptySceneKind(idle) === "welcome-hint", "rail open owns open-folder");
expect(
  emptySceneKind({ ...idle, treeOpen: false }) === "welcome-card",
  "collapsed rail uses the card"
);
expect(
  emptySceneKind({ ...idle, hasReview: true, projectPath: "/abs/path/cad" }) ===
    "none",
  "model loaded is not empty"
);
expect(
  emptySceneKind({ ...idle, progress: 0, projectPath: "/abs/path/cad" }) ===
    "none",
  "loading is not empty"
);
expect(
  emptySceneKind({
    ...idle,
    projectPath: "/abs/path/cad",
    treeOpen: true,
    hasCad: true,
  }) === "pick-file",
  "rail open, has CAD"
);
expect(
  emptySceneKind({
    ...idle,
    projectPath: "/abs/path/cad",
    treeOpen: false,
    hasCad: true,
  }) === "show-files",
  "rail collapsed, has CAD"
);
expect(
  emptySceneKind({
    ...idle,
    projectPath: "/abs/path/cad",
    catalogReady: true,
    hasCad: false,
  }) === "no-cad",
  "empty folder"
);
expect(
  emptySceneKind({
    ...idle,
    projectPath: "/abs/path/cad",
    catalogReady: false,
    hasCad: false,
  }) === "pick-file",
  "catalog not ready is not no-cad"
);
expect(
  emptySceneKind({
    ...idle,
    projectPath: "/abs/path/cad",
    folderGone: true,
    hasCad: true,
  }) === "folder-gone",
  "gone folder"
);

expect(
  normalizeDirPath("/abs/path/cad/") === "/abs/path/cad",
  "strip trailing slash"
);
expect(normalizeDirPath("/") === "/", "root stays");
expect(pathFieldEnterAction("", "/abs/path/cad") === "idle", "empty enter");
expect(
  pathFieldEnterAction("/abs/path/cad", "/abs/path/cad") === "open",
  "listed path opens"
);
expect(
  pathFieldEnterAction("/abs/path/cad/", "/abs/path/cad") === "open",
  "trailing slash still opens"
);
expect(
  pathFieldEnterAction("~/Projects/my-cad", "/abs/path/cad") ===
    "list-then-open",
  "other path lists then opens"
);
expect(
  pathFieldEnterAction("/abs/path/cad", null) === "list-then-open",
  "no listing yet"
);

expect(
  browseListingApply({
    requestId: 1,
    latestId: 2,
    fieldEdited: false,
    seed: true,
  }).apply === false,
  "stale seed discarded"
);
expect(
  browseListingApply({
    requestId: 1,
    latestId: 3,
    fieldEdited: false,
    seed: false,
  }).apply === false,
  "stale go discarded"
);
expect(
  browseListingApply({
    requestId: 2,
    latestId: 2,
    fieldEdited: true,
    seed: true,
  }).writePath === false,
  "typed seed keeps the field"
);
expect(
  browseListingApply({
    requestId: 2,
    latestId: 2,
    fieldEdited: false,
    seed: true,
  }).writePath,
  "unedited seed writes the path"
);
expect(
  browseListingApply({
    requestId: 3,
    latestId: 3,
    fieldEdited: true,
    seed: false,
  }).writePath,
  "go still writes the listed path"
);

expect(
  fileRecentLines("cube.step").extra === null,
  "root file has no second line"
);
expect(fileRecentLines("cube.step").name === "cube.step", "root file name");
expect(
  fileRecentLines("cad/exports/foo.step").name === "foo.step",
  "nested name"
);
expect(
  fileRecentLines("cad/exports/foo.step").extra === "cad/exports/foo.step",
  "nested keeps path"
);

expect(openFolderShortcutLabel(true) === "⌘O", "mac open chord");
expect(openFolderShortcutLabel(false) === "Ctrl+O", "other open chord");
expect(openFolderButtonTitle(true) === "Open folder (⌘O)", "open button title");
expect(
  STARTER_REPO_URL === "https://github.com/sfab-oss/sfab-bench-starter",
  "starter url"
);
expect(
  CAD_SKILL_URL === "https://github.com/earthtojake/text-to-cad",
  "cad skill url"
);

console.log("welcome.selfcheck ok");
