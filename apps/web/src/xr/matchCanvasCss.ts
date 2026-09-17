/**
 * IWER writes canvas.width/height to the window size but leaves R3F's CSS
 * size (the desktop viewer pane). The browser then stretches a landscape
 * buffer into that leftover box, so the emulator preview looks squashed.
 * Point CSS at the drawing buffer. No-op when the buffer is empty.
 */
export function matchCanvasCssToBuffer(canvas: {
  width: number;
  height: number;
  style: { width: string; height: string };
}): void {
  if (canvas.width < 1 || canvas.height < 1) return;
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
}
