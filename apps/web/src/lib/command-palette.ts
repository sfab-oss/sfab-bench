import { formatShortcutToken } from "./settings";

export const EMPTY_QUERY_FILE_LIMIT = 8;
export const EMPTY_QUERY_FOLDER_LIMIT = 5;
export const PARTS_MATCH_CAP = 200;

export const OPEN_SETTINGS_EVENT = "sfab-open-settings";
export const OPEN_QUEST_EVENT = "sfab-open-quest";
export const NEW_CHAT_EVENT = "sfab-new-chat";

export type CommandGroupId = "actions" | "files" | "parts" | "folders" | "appearance";

export const GROUP_ORDER: readonly CommandGroupId[] = [
  "actions",
  "files",
  "parts",
  "folders",
  "appearance",
];

export const GROUP_LABELS: Record<CommandGroupId, string> = {
  actions: "Actions",
  files: "Files",
  parts: "Parts",
  folders: "Folders",
  appearance: "Appearance",
};

export type PaletteCommand = {
  id: string;
  group: CommandGroupId;
  title: string;
  subtitle?: string;
  shortcut?: string;
  current?: boolean;
  payload?: string;
};

export type PaletteGroup = {
  id: CommandGroupId;
  label: string;
  items: PaletteCommand[];
};

export type PaletteFile = {
  name: string;
  path: string;
  current?: boolean;
};

export type PaletteFolder = {
  name: string;
  path: string;
  subtitle: string;
};

export type PalettePart = {
  displayName: string;
  ref: string;
};

export type PaletteOwnerId = "settings" | "quest" | "new-chat";

export type PaletteOwners = {
  settings: boolean;
  quest: boolean;
  newChat: boolean;
};

const mountedOwners = new Set<PaletteOwnerId>();
const ownerListeners = new Set<() => void>();

export function paletteOwnersState(): PaletteOwners {
  return {
    settings: mountedOwners.has("settings"),
    quest: mountedOwners.has("quest"),
    newChat: mountedOwners.has("new-chat"),
  };
}

export function registerPaletteOwner(owner: PaletteOwnerId): () => void {
  mountedOwners.add(owner);
  for (const listener of ownerListeners) listener();
  return () => {
    mountedOwners.delete(owner);
    for (const listener of ownerListeners) listener();
  };
}

export function subscribePaletteOwners(listener: () => void): () => void {
  ownerListeners.add(listener);
  return () => {
    ownerListeners.delete(listener);
  };
}

export type BuildCommandsInput = {
  mac: boolean;
  canOpenFolder: boolean;
  hasProject: boolean;
  hasModel: boolean;
  filesOpen: boolean;
  chatOpen: boolean;
  settings: boolean;
  quest: boolean;
  newChat: boolean;
  files: readonly PaletteFile[];
  folders: readonly PaletteFolder[];
  parts: readonly PalettePart[];
};

export type ModalProbe = {
  palette?: boolean;
  ending?: boolean;
};

export function commandPaletteShortcutLabel(mac: boolean): string {
  return mac ? "⌘K" : "Ctrl+K";
}

/** One chip, matching ⌘O / Ctrl+O as they appear on palette rows. */
export function chordLabel(keys: readonly string[], mac: boolean): string {
  const chips = keys.map((token) => formatShortcutToken(token, mac));
  if (mac && keys[0] === "Mod") return chips.join("");
  return chips.join("+");
}

export function isCommandPaletteToggle(
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  },
  mac: boolean,
): boolean {
  if (event.altKey || event.shiftKey) return false;
  if (event.key !== "k" && event.key !== "K") return false;
  if (mac) return event.metaKey && !event.ctrlKey;
  return event.ctrlKey && !event.metaKey;
}

export function otherModalDialogOpen(modals: readonly ModalProbe[]): boolean {
  return modals.some((modal) => !modal.palette && !modal.ending);
}

export const COMMAND_PALETTE_LIST_ID = "command-palette-list";

export function paletteOptionId(commandId: string): string {
  return `command-option-${commandId.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

export function queryTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function commandHaystack(command: PaletteCommand): string {
  return `${command.title} ${command.subtitle ?? ""}`.toLowerCase();
}

export function commandMatches(command: PaletteCommand, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = commandHaystack(command);
  return tokens.every((token) => haystack.includes(token.toLowerCase()));
}

/** Higher is better. Title prefix beats title substring beats subtitle/AND hits. */
export function commandRank(command: PaletteCommand, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const joined = tokens.join(" ");
  const title = command.title.toLowerCase();
  if (title.startsWith(joined)) return 300;
  if (title.includes(joined)) return 200;
  return 100;
}

export function wrapActiveIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  const step = delta % length;
  return (index + step + length) % length;
}

export function clampActiveIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

export function buildCommands(input: BuildCommandsInput): PaletteCommand[] {
  const commands: PaletteCommand[] = [];
  const filesChord = chordLabel(["Mod", "B"], input.mac);
  const openChord = chordLabel(["Mod", "O"], input.mac);

  if (input.canOpenFolder) {
    commands.push({
      id: "action:open-folder",
      group: "actions",
      title: "Open folder…",
      shortcut: openChord,
    });
  }

  commands.push({
    id: "action:toggle-files",
    group: "actions",
    title: input.filesOpen ? "Hide files" : "Show files",
    shortcut: filesChord,
  });

  if (input.hasProject) {
    commands.push({
      id: "action:toggle-chat",
      group: "actions",
      title: input.chatOpen ? "Hide chat" : "Show chat",
    });
  }

  if (input.newChat) {
    commands.push({
      id: "action:new-chat",
      group: "actions",
      title: "New chat",
    });
  }

  if (input.settings) {
    commands.push({
      id: "action:settings",
      group: "actions",
      title: "Settings",
    });
  }

  if (input.quest) {
    commands.push({
      id: "action:enter-quest",
      group: "actions",
      title: "Enter Quest",
    });
  }

  if (input.hasModel) {
    commands.push({
      id: "action:frame-model",
      group: "actions",
      title: "Frame whole model",
    });
    commands.push({
      id: "action:frame-selection",
      group: "actions",
      title: "Frame selection",
    });
  }

  if (input.hasProject) {
    commands.push({
      id: "action:close-folder",
      group: "actions",
      title: "Close folder",
    });
  }

  for (const file of input.files) {
    commands.push({
      id: `file:${file.path}`,
      group: "files",
      title: `Open ${file.name}`,
      subtitle: file.path,
      current: Boolean(file.current),
      payload: file.path,
    });
  }

  for (const [index, part] of input.parts.entries()) {
    commands.push({
      id: `part:${part.ref}:${index}`,
      group: "parts",
      title: `Select ${part.displayName}`,
      subtitle: part.ref,
      payload: part.ref,
    });
  }

  for (const folder of input.folders) {
    commands.push({
      id: `folder:${folder.path}`,
      group: "folders",
      title: `Switch to ${folder.name}`,
      subtitle: folder.subtitle,
      payload: folder.path,
    });
  }

  commands.push(
    { id: "theme:light", group: "appearance", title: "Theme: Light", payload: "light" },
    { id: "theme:dark", group: "appearance", title: "Theme: Dark", payload: "dark" },
    { id: "theme:system", group: "appearance", title: "Theme: System", payload: "system" },
  );

  return commands;
}

function rankedGroupItems(items: PaletteCommand[], tokens: string[]): PaletteCommand[] {
  return items
    .map((item, index) => ({ item, index, rank: commandRank(item, tokens) }))
    .filter((row) => commandMatches(row.item, tokens))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map((row) => row.item);
}

/**
 * Empty query: Actions + Files (top 8) + Folders (top 5).
 * A query matches title+subtitle (case-insensitive, multi-word AND),
 * then groups, ranking within a group. Parts are filtered first, then capped.
 */
export function visiblePalette(
  commands: readonly PaletteCommand[],
  query: string,
): { groups: PaletteGroup[]; items: PaletteCommand[] } {
  const tokens = queryTokens(query);
  const groups: PaletteGroup[] = [];

  for (const id of GROUP_ORDER) {
    const source = commands.filter((command) => command.group === id);
    if (source.length === 0) continue;

    let items: PaletteCommand[];
    if (tokens.length === 0) {
      if (id === "parts" || id === "appearance") continue;
      if (id === "files") items = source.slice(0, EMPTY_QUERY_FILE_LIMIT);
      else if (id === "folders") items = source.slice(0, EMPTY_QUERY_FOLDER_LIMIT);
      else items = source;
    } else {
      items = rankedGroupItems(source, tokens);
      if (id === "parts") items = items.slice(0, PARTS_MATCH_CAP);
    }

    if (items.length === 0) continue;
    groups.push({ id, label: GROUP_LABELS[id], items });
  }

  return { groups, items: groups.flatMap((group) => group.items) };
}

export function requestOpenSettings() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

export function requestOpenQuest() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_QUEST_EVENT));
}

export function requestNewChat() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NEW_CHAT_EVENT));
}
