import { redact } from "./redact";

export const TEXT_SIZE_STORAGE_KEY = "sfab-bench.text-size";

export type TextSize = "small" | "default" | "large";

/** Multiplier for `--ui-text-scale`. Does not change `html` font-size / rem layout. */
export const TEXT_SIZE_SCALE: Record<TextSize, string> = {
  small: "0.875",
  default: "1",
  large: "1.125",
};

export const UI_TEXT_SCALE_VAR = "--ui-text-scale";

export function parseTextSize(value: string | null | undefined): TextSize {
  return value === "small" || value === "large" ? value : "default";
}

export function textSizeScale(size: TextSize): string {
  return TEXT_SIZE_SCALE[parseTextSize(size)];
}

export type StyleTarget = {
  style: {
    setProperty: (name: string, value: string) => void;
    removeProperty: (name: string) => void;
  };
};

export function applyTextSize(root: StyleTarget, size: TextSize): void {
  const parsed = parseTextSize(size);
  if (parsed === "default") {
    root.style.removeProperty(UI_TEXT_SCALE_VAR);
    return;
  }
  root.style.setProperty(UI_TEXT_SCALE_VAR, textSizeScale(parsed));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function harnessStatusLabel(status: string): string {
  if (status === "ready") return "Ready";
  if (status === "needs-auth") return "Needs login";
  if (status === "missing-cli") return "CLI missing";
  if (status === "error") return "Error";
  return status;
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
      : input.harnesses.map(
          (row) => `  ${row.label}: ${harnessStatusLabel(row.status)}`
        );
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
    `Text size: ${parseTextSize(input.textSize)}`,
    `Last load error: ${error}`,
  ].join("\n");
  return redact(body, input.projectPath ?? "");
}
