import { frameFitObject } from "../cad/review";
import {
  COMMAND_PALETTE_LIST_ID,
  EMPTY_QUERY_FILE_LIMIT,
  EMPTY_QUERY_FOLDER_LIMIT,
  GROUP_LABELS,
  PARTS_MATCH_CAP,
  buildCommands,
  chordLabel,
  clampActiveIndex,
  commandMatches,
  commandPaletteShortcutLabel,
  commandRank,
  isCommandPaletteToggle,
  otherModalDialogOpen,
  paletteOptionId,
  paletteOwnersState,
  queryTokens,
  registerPaletteOwner,
  visiblePalette,
  wrapActiveIndex,
  type PaletteCommand,
} from "./command-palette";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

expect(commandPaletteShortcutLabel(true) === "⌘K", "mac palette chord");
expect(commandPaletteShortcutLabel(false) === "Ctrl+K", "other palette chord");
expect(chordLabel(["Mod", "O"], true) === "⌘O", "mac open chord");
expect(chordLabel(["Mod", "B"], false) === "Ctrl+B", "other files chord");
expect(chordLabel(["Mod", "K"], true) === "⌘K", "mac palette chip");

expect(
  isCommandPaletteToggle({ key: "k", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, true),
  "mac ⌘K",
);
expect(
  isCommandPaletteToggle({ key: "K", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, true),
  "mac shift-less K",
);
expect(
  isCommandPaletteToggle({ key: "k", metaKey: false, ctrlKey: true, altKey: false, shiftKey: false }, true) === false,
  "mac ignores Ctrl+K",
);
expect(
  isCommandPaletteToggle({ key: "k", metaKey: false, ctrlKey: true, altKey: false, shiftKey: false }, false),
  "other Ctrl+K",
);
expect(
  isCommandPaletteToggle({ key: "k", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, false) === false,
  "other ignores ⌘K",
);
expect(
  isCommandPaletteToggle({ key: "k", metaKey: true, ctrlKey: false, altKey: true, shiftKey: false }, true) === false,
  "alt blocks",
);
expect(
  isCommandPaletteToggle({ key: "k", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true }, true) === false,
  "shift blocks",
);
expect(
  isCommandPaletteToggle({ key: "o", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, true) === false,
  "not O",
);

expect(otherModalDialogOpen([]) === false, "no dialogs");
expect(otherModalDialogOpen([{ palette: true }]) === false, "palette itself is not other");
expect(otherModalDialogOpen([{ ending: true }]) === false, "closing dialog is ignored");
expect(otherModalDialogOpen([{}]), "settings counts");
expect(otherModalDialogOpen([{ palette: true }, {}]), "settings behind palette still counts");

expect(queryTokens("  Foo   BAR ").join(",") === "foo,bar", "tokens lowercased");
expect(queryTokens("").length === 0, "empty tokens");

const sample: PaletteCommand = {
  id: "file:cad/bracket.step",
  group: "files",
  title: "Open bracket.step",
  subtitle: "cad/bracket.step",
};
expect(commandMatches(sample, ["bracket"]), "title hit");
expect(commandMatches(sample, ["cad/bracket"]), "subtitle hit");
expect(commandMatches(sample, ["open", "cad"]), "AND title+subtitle");
expect(commandMatches(sample, ["OPEN", "STEP"]), "case-insensitive");
expect(commandMatches(sample, ["glb"]) === false, "missing token fails AND");
expect(commandRank(sample, ["open bracket.step"]) === 300, "title prefix");
expect(commandRank(sample, ["bracket.step"]) === 200, "title contains");
expect(commandRank(sample, ["cad/bracket"]) === 100, "subtitle only");

expect(wrapActiveIndex(0, 1, 3) === 1, "down");
expect(wrapActiveIndex(2, 1, 3) === 0, "down wrap");
expect(wrapActiveIndex(0, -1, 3) === 2, "up wrap");
expect(wrapActiveIndex(1, -1, 3) === 0, "up");
expect(wrapActiveIndex(0, 1, 0) === 0, "empty wrap");
expect(clampActiveIndex(5, 3) === 2, "clamp high");
expect(clampActiveIndex(-1, 3) === 0, "clamp low");
expect(clampActiveIndex(0, 0) === 0, "clamp empty");

const files = Array.from({ length: 12 }, (_, i) => ({
  name: `part-${i}.step`,
  path: `cad/part-${i}.step`,
  current: i === 0,
}));
const folders = Array.from({ length: 7 }, (_, i) => ({
  name: `proj-${i}`,
  path: `/abs/path/proj-${i}`,
  subtitle: `~/cad/proj-${i}`,
}));
const parts = Array.from({ length: PARTS_MATCH_CAP + 40 }, (_, i) => ({
  displayName: i === 3 ? "Housing" : `Part ${i}`,
  ref: `#o1.${i}`,
}));

const full = buildCommands({
  mac: true,
  canOpenFolder: true,
  hasProject: true,
  hasModel: true,
  filesOpen: true,
  chatOpen: false,
  settings: true,
  quest: true,
  newChat: true,
  files,
  folders,
  parts,
});

expect(full.some((c) => c.id === "action:open-folder" && c.title === "Open folder…" && c.shortcut === "⌘O"), "open folder");
expect(full.some((c) => c.id === "action:toggle-files" && c.title === "Hide files" && c.shortcut === "⌘B"), "hide files");
expect(full.some((c) => c.id === "action:toggle-chat" && c.title === "Show chat"), "show chat");
expect(full.some((c) => c.id === "action:refresh-files" && c.title === "Refresh files"), "refresh files");
expect(full.some((c) => c.id === "action:new-chat"), "new chat");
expect(full.some((c) => c.id === "action:settings"), "settings");
expect(full.some((c) => c.id === "action:enter-quest"), "enter quest");
expect(full.some((c) => c.id === "action:frame-model"), "frame model");
expect(full.some((c) => c.id === "action:frame-selection"), "frame selection");
expect(full.some((c) => c.id === "action:close-folder"), "close folder");
expect(full.some((c) => c.group === "files" && c.current && c.title === "Open part-0.step"), "current file marked");
expect(full.some((c) => c.group === "folders" && c.title === "Switch to proj-1" && c.subtitle === "~/cad/proj-1"), "folder subtitle");
expect(full.some((c) => c.group === "parts" && c.title === "Select Housing" && c.subtitle === "#o1.3"), "part ref");
expect(full.some((c) => c.id === "theme:system"), "theme system");

const empty = visiblePalette(full, "");
expect(
  empty.groups.map((g) => g.id).join(",") === "actions,files,folders",
  "empty query groups",
);
expect(empty.groups.find((g) => g.id === "files")?.items.length === EMPTY_QUERY_FILE_LIMIT, "empty files cap");
expect(empty.groups.find((g) => g.id === "folders")?.items.length === EMPTY_QUERY_FOLDER_LIMIT, "empty folders cap");
expect(empty.groups.some((g) => g.id === "parts") === false, "empty hides parts");
expect(empty.groups.some((g) => g.id === "appearance") === false, "empty hides appearance");
expect(empty.groups[0]?.label === GROUP_LABELS.actions, "actions header");

const housing = visiblePalette(full, "housing");
expect(housing.items.length === 1 && housing.items[0]?.payload === "#o1.3", "filter finds the named part");
expect(housing.groups[0]?.id === "parts", "hit lives in Parts");

const tooManyParts = visiblePalette(full, "part");
const partsGroup = tooManyParts.groups.find((g) => g.id === "parts");
expect((partsGroup?.items.length ?? 0) === PARTS_MATCH_CAP, "parts cap after filter");
expect(tooManyParts.items.some((c) => c.subtitle === `#o1.${PARTS_MATCH_CAP + 10}`) === false, "uncapped tail dropped");

const theme = visiblePalette(full, "theme dark");
expect(theme.items.some((c) => c.id === "theme:dark"), "AND appearance");
expect(theme.items.some((c) => c.id === "theme:light") === false, "AND excludes light");

const none = visiblePalette(full, "definitely-not-a-command");
expect(none.groups.length === 0 && none.items.length === 0, "no results");

const guest = buildCommands({
  mac: false,
  canOpenFolder: false,
  hasProject: false,
  hasModel: false,
  filesOpen: false,
  chatOpen: false,
  settings: true,
  quest: false,
  newChat: false,
  files: [],
  folders: [],
  parts: [],
});
expect(guest.some((c) => c.id === "action:open-folder") === false, "guest cannot open folder");
expect(guest.some((c) => c.id === "action:enter-quest") === false, "guest hides quest");
expect(guest.some((c) => c.id === "action:close-folder") === false, "no folder to close");
expect(guest.some((c) => c.id === "action:refresh-files") === false, "no files without folder");
expect(guest.some((c) => c.id === "action:new-chat") === false, "no chat without folder");
expect(guest.some((c) => c.id === "action:frame-model") === false, "no model to frame");
expect(guest.some((c) => c.id === "action:toggle-files" && c.title === "Show files" && c.shortcut === "Ctrl+B"), "guest files");
expect(guest.some((c) => c.id === "action:settings"), "settings when owner is mounted");

const xr = buildCommands({
  mac: true,
  canOpenFolder: true,
  hasProject: true,
  hasModel: true,
  filesOpen: true,
  chatOpen: true,
  settings: false,
  quest: false,
  newChat: false,
  files: [],
  folders: [],
  parts: [],
});
expect(xr.some((c) => c.id === "action:settings") === false, "unmounted settings hidden");
expect(xr.some((c) => c.id === "action:enter-quest") === false, "unmounted quest hidden");
expect(xr.some((c) => c.id === "action:new-chat") === false, "unmounted new chat hidden");
expect(xr.some((c) => c.id === "action:toggle-chat"), "chat toggle still works from store");

const ranked = visiblePalette(
  [
    { id: "a", group: "actions", title: "Later open folder", subtitle: "zzz" },
    { id: "b", group: "actions", title: "Open folder…", subtitle: "first" },
    { id: "c", group: "files", title: "Open later.step", subtitle: "cad/open" },
  ],
  "open folder",
);
expect(ranked.groups.map((g) => g.id).join(",") === "actions", "group order held");
expect(ranked.groups[0]?.items[0]?.id === "b", "prefix ranks above contains");
expect(ranked.groups[0]?.items[1]?.id === "a", "contains stays second");

expect(COMMAND_PALETTE_LIST_ID === "command-palette-list", "listbox id");
expect(paletteOptionId("file:cad/bracket.step") === "command-option-file-cad-bracket-step", "stable option id");
expect(paletteOptionId("action:settings") === "command-option-action-settings", "action option id");

const dropSettings = registerPaletteOwner("settings");
expect(paletteOwnersState().settings, "owner registers");
const dropQuest = registerPaletteOwner("quest");
expect(paletteOwnersState().quest, "quest owner registers");
dropSettings();
expect(paletteOwnersState().settings === false, "owner unregisters");
expect(paletteOwnersState().quest, "other owner remains");
dropQuest();
expect(paletteOwnersState().quest === false, "quest unregisters");

const root = { id: "root" };
const part = { object: { id: "part" } };
const frameReview = { root, parts: [part] };
expect(frameFitObject(frameReview, null, "model") === root, "frame model uses root");
expect(frameFitObject(frameReview, null, "selection") === root, "frame selection without pick uses root");
expect(frameFitObject(frameReview, 0, "selection") === part.object, "frame selection uses part");
expect(frameFitObject(null, 0, "model") === null, "frame without review");

console.log("command-palette.selfcheck ok");
