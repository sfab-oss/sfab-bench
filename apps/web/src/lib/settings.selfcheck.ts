import {
  SETTINGS_SHORTCUTS,
  applyContrastVars,
  applyTextSize,
  clampContrast,
  contrastCssVars,
  formatDebugReport,
  formatShortcutChips,
  formatShortcutToken,
  harnessStatusLabel,
  parseContrast,
  parseTextSize,
  textSizeScale,
} from "./settings";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

expect(clampContrast(100) === 100, "default contrast");
expect(clampContrast(90) === 90, "min contrast");
expect(clampContrast(130) === 130, "max contrast");
expect(clampContrast(80) === 90, "clamp below min");
expect(clampContrast(200) === 130, "clamp above max");
expect(clampContrast(Number.NaN) === 100, "nan is default");
expect(parseContrast(null) === 100, "missing storage");
expect(parseContrast("115") === 115, "stored contrast");
expect(parseContrast("not-a-number") === 100, "garbage contrast");
expect(parseContrast("50") === 90, "stored out of range");

const faded = contrastCssVars(90);
expect(faded["--appearance-contrast-base"] === "90%", "fade base");
expect(faded["--appearance-contrast-boost"] === "0%", "fade boost");
expect(faded["--appearance-contrast-border-boost"] === "0%", "fade border");

const boost = contrastCssVars(130);
expect(boost["--appearance-contrast-base"] === "100%", "boost base stays 100");
expect(boost["--appearance-contrast-boost"] === "30%", "boost amount");
expect(boost["--appearance-contrast-border-boost"] === "7.5%", "border is boost/4");

const mid = contrastCssVars(100);
expect(mid["--appearance-contrast-base"] === "100%" && mid["--appearance-contrast-boost"] === "0%", "neutral mix");

const calls: string[][] = [];
const root = {
  style: {
    setProperty(name: string, value: string) {
      calls.push([name, value]);
    },
    removeProperty(name: string) {
      calls.push(["remove", name]);
    },
  },
};
applyContrastVars(root, 120);
expect(
  calls[0]?.[0] === "--appearance-contrast-base" && calls[0]?.[1] === "100%",
  "apply writes base",
);
expect(calls[1]?.[1] === "20%", "apply writes boost");

expect(parseTextSize("small") === "small", "small size");
expect(parseTextSize("large") === "large", "large size");
expect(parseTextSize("huge") === "default", "unknown size");
expect(textSizeScale("small") === "0.875", "small scale");
expect(textSizeScale("default") === "1", "default scale");
expect(textSizeScale("large") === "1.125", "large scale");

applyTextSize(root, "large");
expect(calls.some((c) => c[0] === "--ui-text-scale" && c[1] === "1.125"), "large writes chrome scale");
applyTextSize(root, "default");
expect(calls.some((c) => c[0] === "remove" && c[1] === "--ui-text-scale"), "default clears chrome scale");

expect(harnessStatusLabel("ready") === "Ready", "ready label");
expect(harnessStatusLabel("needs-auth") === "Needs login", "auth label");
expect(harnessStatusLabel("missing-cli") === "CLI missing", "cli label");

expect(formatShortcutToken("Mod", true) === "⌘", "mac mod");
expect(formatShortcutToken("Mod", false) === "Ctrl", "other mod");
expect(formatShortcutChips(["Mod", "B"], true).join(" ") === "⌘ B", "mac files chord");
expect(formatShortcutChips(["Mod", "O"], false).join(" ") === "Ctrl O", "other open chord");
expect(formatShortcutChips(["Shift", "Enter"], true).join("+") === "Shift+Enter", "newline chips");
expect(SETTINGS_SHORTCUTS.some((row) => row.action === "Command palette" && row.keys.includes("K")), "palette shortcut");
expect(SETTINGS_SHORTCUTS.some((row) => row.keys.includes("Mod") && row.keys.includes("B")), "files shortcut");
expect(SETTINGS_SHORTCUTS.some((row) => row.keys.includes("#")), "mention shortcut");
expect(SETTINGS_SHORTCUTS.some((row) => row.keys.includes("1–9")), "ask-user digits");
expect(SETTINGS_SHORTCUTS.some((row) => row.keys.includes("Esc")), "esc shortcut");

const report = formatDebugReport({
  appName: "sfab-bench",
  version: "0.1.1",
  userAgent: "Mozilla/5.0",
  principalKind: "loopback",
  folderName: "cad",
  fileBasename: "bracket.step",
  projectPath: "/Users/you/proj",
  harnesses: [
    { label: "Codex", status: "needs-auth" },
    { label: "OpenCode", status: "ready" },
  ],
  theme: "system",
  contrast: 110,
  textSize: "large",
  loadError: "tessellating /Users/you/proj/cad/bracket.step took longer than 300000ms",
});
expect(report.includes("sfab-bench 0.1.1"), "app + version");
expect(report.includes("Principal: loopback"), "kind only");
expect(report.includes("Folder: cad"), "folder name");
expect(report.includes("File: bracket.step"), "file basename");
expect(report.includes("Codex: Needs login"), "harness status text");
expect(report.includes("OpenCode: Ready"), "ready harness");
expect(report.includes("Theme: system"), "theme");
expect(report.includes("Contrast: 110%"), "contrast");
expect(report.includes("Text size: large"), "text size");
expect(report.includes("<project>/cad/bracket.step"), "load error redacted");
expect(report.includes("/Users/") === false, "no home path");
expect(report.includes("Quest-Living-Room") === false, "no device names");

const empty = formatDebugReport({
  appName: "sfab-bench",
  version: "0.1.1",
  userAgent: "Mozilla/5.0",
  principalKind: "paired",
  folderName: null,
  fileBasename: "",
  harnesses: [],
  theme: "dark",
  contrast: 100,
  textSize: "default",
  loadError: null,
});
expect(empty.includes("Principal: paired"), "paired kind");
expect(empty.includes("Folder: (none)"), "no folder");
expect(empty.includes("File: (none)"), "no file");
expect(empty.includes("Last load error: (none)"), "no error");
expect(empty.includes("  (none)"), "no harnesses");

console.log("settings.selfcheck ok");
