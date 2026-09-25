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

/**
 * Status of a scrubbed frame. The frame has no play bit, so a loaded
 * board reads as running rather than as the live run's pause.
 */
export function scrubbedBoardStatus(
  board: { running: boolean; fault?: string; brownout?: boolean } | undefined
): "" | "running" | "stopped" | "brownout" {
  if (!board) return "";
  if (board.brownout) return "brownout";
  if (!board.running || board.fault) return "stopped";
  return "running";
}
