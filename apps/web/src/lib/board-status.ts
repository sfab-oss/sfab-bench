type BoardStatusInput = {
  running: boolean;
  fault?: string;
  brownout?: boolean;
  /** No supply reaches the board, so the CPU never boots. */
  unpowered?: boolean;
};

/** What the board header says. `running` means the sim is playing, not merely loaded. */
export function boardStatusLabel(
  board: BoardStatusInput | undefined,
  playing: boolean
): "" | "paused" | "running" | "stopped" | "brownout" | "unpowered" {
  if (!board) return "";
  if (board.unpowered) return "unpowered";
  if (board.brownout) return "brownout";
  if (!board.running || board.fault) return "stopped";
  return playing ? "running" : "paused";
}

/**
 * Status of a scrubbed frame. The frame has no play bit, so a loaded
 * board reads as running rather than as the live run's pause.
 */
export function scrubbedBoardStatus(
  board: BoardStatusInput | undefined
): "" | "running" | "stopped" | "brownout" | "unpowered" {
  if (!board) return "";
  if (board.unpowered) return "unpowered";
  if (board.brownout) return "brownout";
  if (!board.running || board.fault) return "stopped";
  return "running";
}
