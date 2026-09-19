import { version as packageVersion } from "../../package.json";
import { redact } from "./redact";

export const APP_DISPLAY_NAME = "sfab-bench";
export const APP_VERSION = packageVersion;

/** One-line card copy: message only, no stack. Truncation is CSS. */
export function crashCardReason(error: unknown, projectPath = ""): string {
  let raw = "";
  if (error instanceof Error) {
    raw = error.message.trim() || error.name || "Error";
  } else if (typeof error === "string") {
    raw = error.trim();
  }
  return redact(raw || "An unexpected error occurred.", projectPath);
}

function errorDetails(error: unknown): string {
  if (error instanceof Error) {
    const stack = error.stack?.trim();
    if (stack) return stack;
    const name = error.name || "Error";
    const message = error.message.trim();
    return message ? `${name}: ${message}` : name;
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export function formatCrashReport(input: {
  pathname: string;
  time: string;
  error: unknown;
  projectPath?: string;
}): string {
  const path = input.pathname.split("?")[0] || "/";
  const body = [
    `${APP_DISPLAY_NAME} ${APP_VERSION}`,
    `Path: ${path}`,
    `Time: ${input.time}`,
    "",
    errorDetails(input.error),
  ].join("\n");
  return redact(body, input.projectPath ?? "");
}
