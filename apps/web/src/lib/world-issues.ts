import type { WorldSender } from "@sfab-bench/contract";

/** One row of the canvas error overlay. Hint is split out of the validator message. */
export type WorldIssueLine = {
  code: string;
  path: string;
  message: string;
  hint: string;
};

export function formatWorldIssues(
  errors: readonly { code: string; path: string; message: string }[],
  fallback?: string | null
): WorldIssueLine[] {
  if (errors.length === 0) {
    const message = fallback?.trim() ?? "";
    if (!message) return [];
    return [splitIssue("error", "", message)];
  }
  return errors.map((issue) =>
    splitIssue(issue.code, issue.path, issue.message)
  );
}

function splitIssue(code: string, path: string, raw: string): WorldIssueLine {
  const idx = raw.indexOf("Hint:");
  if (idx === -1) {
    return { code, path, message: raw.trim(), hint: "" };
  }
  return {
    code,
    path,
    message: raw.slice(0, idx).trim(),
    hint: raw.slice(idx + "Hint:".length).trim(),
  };
}

/** `12.345 s`. The desktop run readout. */
export function formatSimTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0.000 s";
  return `${seconds.toFixed(3)} s`;
}

/** "Paused by Headset A", "Played by agent". */
export function commandNotice(
  command: "play" | "pause",
  by: WorldSender
): string {
  const who = by.kind === "agent" ? "agent" : by.label || "someone";
  return command === "play" ? `Played by ${who}` : `Paused by ${who}`;
}

/**
 * A command from this tab is not a notice. Loopback clients share the
 * label "Mac"; a paired device matches its session label.
 */
export function commandIsOwn(
  by: WorldSender,
  you: { id: string; label: string }
): boolean {
  if (by.kind === "agent") return false;
  if (by.kind === "loopback") return you.id === "loopback";
  return you.id !== "loopback" && by.label === you.label;
}
