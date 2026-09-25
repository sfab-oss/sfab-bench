/** What the board header says. `running` means the sim is playing, not merely loaded. */
export function boardStatusLabel(
  board: { running: boolean; fault?: string } | undefined,
  playing: boolean
): "" | "paused" | "running" | "stopped" {
  if (!board) return "";
  if (!board.running || board.fault) return "stopped";
  return playing ? "running" : "paused";
}
