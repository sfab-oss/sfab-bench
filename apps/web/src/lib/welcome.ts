/** Welcome / empty-scene helpers. Keep `/` empty until the tab names a folder. */

import { formatShortcut, shortcutTooltip } from "./shortcuts";

export const PRODUCT_TITLE = "sfab-bench";

export type EmptySceneKind =
  | "none"
  | "welcome-hint"
  | "welcome-card"
  | "pick-file"
  | "show-files"
  | "no-cad"
  | "folder-gone";

export type EmptySceneInput = {
  hasReview: boolean;
  progress: number | null;
  loadError: boolean;
  sceneCrash: boolean;
  projectPath: string;
  treeOpen: boolean;
  catalogReady: boolean;
  hasCad: boolean;
  folderGone: boolean;
};

/** What the canvas should show when no model is up. */
export function emptySceneKind(input: EmptySceneInput): EmptySceneKind {
  if (
    input.hasReview ||
    input.progress !== null ||
    input.loadError ||
    input.sceneCrash
  ) {
    return "none";
  }
  if (!input.projectPath)
    return input.treeOpen ? "welcome-hint" : "welcome-card";
  if (input.folderGone) return "folder-gone";
  if (input.catalogReady && !input.hasCad) return "no-cad";
  return input.treeOpen ? "pick-file" : "show-files";
}

export function documentTitle(input: {
  folderName?: string | null;
  fileName?: string | null;
}): string {
  const folder = input.folderName?.trim() ?? "";
  const file = input.fileName?.trim() ?? "";
  if (file && folder) return `${file} — ${folder} — ${PRODUCT_TITLE}`;
  if (folder) return `${folder} — ${PRODUCT_TITLE}`;
  if (file) return `${file} — ${PRODUCT_TITLE}`;
  return PRODUCT_TITLE;
}

export function normalizeDirPath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (!trimmed) return "";
  if (trimmed === "/") return "/";
  return trimmed.replace(/\/+$/, "");
}

export type PathEnterAction = "idle" | "open" | "list-then-open";

/** Enter in the browse path field: open when already listed, otherwise list then open. */
export function pathFieldEnterAction(
  typed: string,
  listedPath: string | null
): PathEnterAction {
  const value = typed.trim();
  if (!value) return "idle";
  if (listedPath && normalizeDirPath(value) === normalizeDirPath(listedPath))
    return "open";
  return "list-then-open";
}

/** Latest browse request wins; the seed listing must not overwrite a typed path. */
export function browseListingApply(input: {
  requestId: number;
  latestId: number;
  fieldEdited: boolean;
  seed: boolean;
}): { apply: boolean; writePath: boolean } {
  if (input.requestId !== input.latestId)
    return { apply: false, writePath: false };
  if (input.seed) return { apply: true, writePath: !input.fieldEdited };
  return { apply: true, writePath: true };
}

export function fileRecentLines(path: string): {
  name: string;
  extra: string | null;
} {
  const name = path.split("/").filter(Boolean).pop() ?? path;
  return { name, extra: path === name ? null : path };
}

export function openFolderShortcutLabel(mac: boolean): string {
  return formatShortcut("open-folder", mac);
}

export function openFolderButtonTitle(mac: boolean): string {
  return shortcutTooltip("Open folder", "open-folder", mac);
}

export const FOLDER_ERROR_EVENT = "sfab-folder-error";

export function emitFolderError(message: string | null) {
  window.dispatchEvent(
    new CustomEvent(FOLDER_ERROR_EVENT, { detail: message })
  );
}
