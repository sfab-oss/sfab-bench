/** Reduced motion, first-paint suppression, and close-folder confirm. */

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const MOTION_READY_ATTR = "data-motion";
export const MOTION_READY_VALUE = "ready";
export const CLOSE_FOLDER_EVENT = "sfab-close-folder";
export const REFRESH_FILES_EVENT = "sfab-refresh-files";

export const CLOSE_FOLDER_BODY = "The open model and chat will be cleared from this tab.";

/** True when the OS (or a test double) asks for reduced motion. */
export function prefersReducedMotion(matches: boolean): boolean {
  return matches;
}

/** Restored chrome must not animate in; later user actions may. */
export function firstPaintSuppressed(paintedKey: string | null, navigationKey: string): boolean {
  return paintedKey !== navigationKey;
}

export function orbitDampingEnabled(prefersReduce: boolean): boolean {
  return !prefersReduce;
}

/** Desktop viewer idles; an XR session needs the always-on loop. */
export function viewerFrameloop(xrSessionActive: boolean): "always" | "demand" {
  return xrSessionActive ? "always" : "demand";
}

export function closeFolderNeedsConfirm(input: { hasModel: boolean; replyInProgress: boolean }): boolean {
  return input.hasModel || input.replyInProgress;
}

export function closeFolderTitle(folderLabel: string): string {
  const name = folderLabel.trim() || "folder";
  return `Close ${name}?`;
}

export function refreshFilesTooltip(refreshing: boolean): string {
  return refreshing ? "Refreshing…" : "Refresh files";
}

export function motionRootIsReady(attrValue: string | null | undefined): boolean {
  return attrValue === MOTION_READY_VALUE;
}

export function requestCloseFolder() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CLOSE_FOLDER_EVENT));
}

export function requestRefreshFiles() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REFRESH_FILES_EVENT));
}
