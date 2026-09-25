/** What the board header says. `running` means the sim is playing, not merely loaded. */
export function boardStatusLabel(
  board: { running: boolean; fault?: string; brownout?: boolean } | undefined,
  playing: boolean
): "" | "paused" | "running" | "stopped" | "brownout" {
  if (!board) return "";
  if (board.brownout) return "brownout";
  if (!board.running || board.fault) return "stopped";
  return playing ? "running" : "paused";
}
