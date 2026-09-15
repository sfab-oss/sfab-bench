import {
  CLOSE_FOLDER_BODY,
  MOTION_READY_VALUE,
  closeFolderNeedsConfirm,
  closeFolderTitle,
  firstPaintSuppressed,
  motionRootIsReady,
  orbitDampingEnabled,
  prefersReducedMotion,
  refreshFilesTooltip,
  viewerFrameloop,
} from "./motion";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

expect(prefersReducedMotion(true), "reduce matches");
expect(prefersReducedMotion(false) === false, "no-preference");

expect(firstPaintSuppressed(null, "workbench"), "unpainted is held");
expect(firstPaintSuppressed("boot", "workbench"), "new key is held");
expect(firstPaintSuppressed("workbench", "workbench") === false, "same key is released");

expect(orbitDampingEnabled(false), "damping on");
expect(orbitDampingEnabled(true) === false, "reduce disables damping");

expect(viewerFrameloop(false) === "demand", "desktop on demand");
expect(viewerFrameloop(true) === "always", "XR always");

expect(closeFolderNeedsConfirm({ hasModel: false, replyInProgress: false }) === false, "empty tab closes");
expect(closeFolderNeedsConfirm({ hasModel: true, replyInProgress: false }), "loaded model confirms");
expect(closeFolderNeedsConfirm({ hasModel: false, replyInProgress: true }), "live reply confirms");
expect(closeFolderNeedsConfirm({ hasModel: true, replyInProgress: true }), "both confirm");

expect(closeFolderTitle("bracket") === "Close bracket?", "named folder");
expect(closeFolderTitle("  ") === "Close folder?", "blank falls back");
expect(CLOSE_FOLDER_BODY.includes("cleared from this tab"), "body copy");

expect(refreshFilesTooltip(false) === "Refresh files", "idle tooltip");
expect(refreshFilesTooltip(true) === "Refreshing…", "busy tooltip");

expect(motionRootIsReady(MOTION_READY_VALUE), "ready attr");
expect(motionRootIsReady(null) === false, "missing attr is held");
expect(motionRootIsReady("pending") === false, "other value is held");

console.log("motion.selfcheck ok");
