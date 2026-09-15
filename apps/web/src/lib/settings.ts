import { redact } from "./redact";

export const CONTRAST_MIN = 90;
export const CONTRAST_MAX = 130;
export const CONTRAST_DEFAULT = 100;
export const CONTRAST_STORAGE_KEY = "sfab-bench.contrast";
export const TEXT_SIZE_STORAGE_KEY = "sfab-bench.text-size";

export type TextSize = "small" | "default" | "large";

export const TEXT_SIZE_SCALE: Record<TextSize, string> = {
  small: "87.5%",
  default: "100%",
  large: "112.5%",
};

export type ContrastCssVars = {
  "--appearance-contrast-base": string;
  "--appearance-contrast-boost": string;
  "--appearance-contrast-border-boost": string;
};

export function clampContrast(value: number): number {
  if (!Number.isFinite(value)) return CONTRAST_DEFAULT;
  return Math.min(CONTRAST_MAX, Math.max(CONTRAST_MIN, Math.round(value)));
}

export function parseContrast(value: string | null | undefined): number {
  if (value == null || value.trim() === "") return CONTRAST_DEFAULT;
  return clampContrast(Number(value));
}

export function parseTextSize(value: string | null | undefined): TextSize {
  return value === "small" || value === "large" ? value : "default";
}

/** T3-style mix knobs: below 100% fades toward the canvas; above 100% boosts toward black/white. */
export function contrastCssVars(contrast: number): ContrastCssVars {
  const c = clampContrast(contrast);
  return {
    "--appearance-contrast-base": `${Math.min(c, 100)}%`,
    "--appearance-contrast-boost": `${Math.max(c - 100, 0)}%`,
    "--appearance-contrast-border-boost": `${Math.max(c - 100, 0) / 4}%`,
  };
}

export function textSizeFontSize(size: TextSize): string {
  return TEXT_SIZE_SCALE[parseTextSize(size)];
}

export type StyleTarget = {
  style: {
    setProperty: (name: string, value: string) => void;
    removeProperty: (name: string) => void;
    fontSize: string;
  };
};

export function applyContrastVars(root: StyleTarget, contrast: number): void {
  const vars = contrastCssVars(contrast);
  root.style.setProperty("--appearance-contrast-base", vars["--appearance-contrast-base"]);
  root.style.setProperty("--appearance-contrast-boost", vars["--appearance-contrast-boost"]);
  root.style.setProperty("--appearance-contrast-border-boost", vars["--appearance-contrast-border-boost"]);
}

export function applyTextSize(root: StyleTarget, size: TextSize): void {
  const parsed = parseTextSize(size);
  if (parsed === "default") {
    root.style.removeProperty("font-size");
    root.style.fontSize = "";
    return;
  }
  root.style.fontSize = textSizeFontSize(parsed);
}

export function harnessStatusLabel(status: string): string {
  if (status === "ready") return "Ready";
  if (status === "needs-auth") return "Needs login";
  if (status === "missing-cli") return "CLI missing";
  if (status === "error") return "Error";
  return status;
}

export type ShortcutSpec = {
  action: string;
  keys: readonly string[];
};

/** Shortcuts that have handlers on this branch. `Mod` becomes ⌘ or Ctrl. */
export const SETTINGS_SHORTCUTS: readonly ShortcutSpec[] = [
  { action: "Show or hide files", keys: ["Mod", "B"] },
  { action: "Open folder", keys: ["Mod", "O"] },
  { action: "Send", keys: ["Enter"] },
  { action: "New line", keys: ["Shift", "Enter"] },
  { action: "Recall previous prompt", keys: ["↑"] },
  { action: "Mention a part", keys: ["#"] },
  { action: "Cancel voice, close mention, or close a dialog", keys: ["Esc"] },
];

export function formatShortcutToken(token: string, mac: boolean): string {
  if (token === "Mod") return mac ? "⌘" : "Ctrl";
  return token;
}

export function formatShortcutChips(keys: readonly string[], mac: boolean): string[] {
  return keys.map((token) => formatShortcutToken(token, mac));
}

export type DebugReportInput = {
  appName: string;
  version: string;
  userAgent: string;
  principalKind: "loopback" | "paired" | "unknown";
  folderName: string | null;
  fileBasename: string | null;
  projectPath?: string;
  harnesses: readonly { label: string; status: string }[];
  theme: string;
  contrast: number;
  textSize: TextSize;
  loadError: string | null;
};

function nameOrNone(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed || "(none)";
}

export function formatDebugReport(input: DebugReportInput): string {
  const harnessLines =
    input.harnesses.length === 0
      ? ["  (none)"]
      : input.harnesses.map((row) => `  ${row.label}: ${harnessStatusLabel(row.status)}`);
  const error = input.loadError?.trim() ? input.loadError.trim() : "(none)";
  const body = [
    `${input.appName} ${input.version}`,
    `User agent: ${input.userAgent}`,
    `Principal: ${input.principalKind}`,
    `Folder: ${nameOrNone(input.folderName)}`,
    `File: ${nameOrNone(input.fileBasename)}`,
    "Harnesses:",
    ...harnessLines,
    `Theme: ${input.theme}`,
    `Contrast: ${clampContrast(input.contrast)}%`,
    `Text size: ${parseTextSize(input.textSize)}`,
    `Last load error: ${error}`,
  ].join("\n");
  return redact(body, input.projectPath ?? "");
}
