type MeasurePointLike = { point: [number, number, number] };

/** Native gizmo sizes (metres). XR keeps these as world size. */
export const MEASURE_SPHERE_RADIUS = 0.004;
export const MEASURE_LABEL_PIXEL_SIZE = 0.0006;
export const MEASURE_LABEL_FONT_SIZE = 18;
export const MEASURE_LABEL_PAD_Y = 5;
export const MEASURE_LABEL_OFFSET_Y = 0.014;
/** uikit Text line box vs fontSize — desktop offset only, so the pill clears the line. */
export const MEASURE_LABEL_LINE_HEIGHT = 1.2;
/** Desktop: pill bottom above the midpoint, CSS pixels. */
export const MEASURE_DESKTOP_CLEAR_PX = 8;

/** Desktop on-screen targets (CSS pixels): text ~13–14, sphere diameter ~8–10. */
export const MEASURE_DESKTOP_TEXT_PX = 13.5;
export const MEASURE_DESKTOP_SPHERE_PX = 9;

export function measureNativeTextHeight(): number {
  return MEASURE_LABEL_FONT_SIZE * MEASURE_LABEL_PIXEL_SIZE;
}

export function measureNativeLabelHeight(): number {
  return (MEASURE_LABEL_FONT_SIZE + MEASURE_LABEL_PAD_Y * 2) * MEASURE_LABEL_PIXEL_SIZE;
}

/** Native local Y of the desktop chip origin (half line-box + clearance). XR keeps 0.014. */
export function measureDesktopLabelOffsetY(): number {
  const half =
    ((MEASURE_LABEL_FONT_SIZE * MEASURE_LABEL_LINE_HEIGHT + MEASURE_LABEL_PAD_Y * 2) * MEASURE_LABEL_PIXEL_SIZE) / 2;
  const clear = (measureNativeTextHeight() * MEASURE_DESKTOP_CLEAR_PX) / MEASURE_DESKTOP_TEXT_PX;
  return half + clear;
}

/** Vertical world metres per CSS pixel at `distance` for a perspective camera. */
export function perspectiveWorldPerCssPx(
  distance: number,
  fovDeg: number,
  canvasHeight: number,
  zoom = 1,
): number {
  const height = Math.max(canvasHeight, 1);
  const z = Math.max(zoom, 1e-6);
  const dist = Math.max(distance, 1e-6);
  return (2 * dist * Math.tan((fovDeg * Math.PI) / 360)) / (height * z);
}

/**
 * Local scale (after undoing parent scale) so `nativeWorldSize` metres read as
 * `targetCssPx` on screen. Independent of model size; linear in camera distance.
 */
export function measureScreenScale(
  nativeWorldSize: number,
  targetCssPx: number,
  distance: number,
  fovDeg: number,
  canvasHeight: number,
  zoom = 1,
): number {
  const perPx = perspectiveWorldPerCssPx(distance, fovDeg, canvasHeight, zoom);
  return (targetCssPx * perPx) / Math.max(nativeWorldSize, 1e-9);
}

export function formatMm(n: number) {
  const v = n * 1000;
  return `${Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)} mm`;
}

export function measureDelta(
  a: MeasurePointLike | null,
  b: MeasurePointLike | null,
): { dx: number; dy: number; dz: number; dist: number } | null {
  if (!a || !b) return null;
  const dx = b.point[0] - a.point[0];
  const dy = b.point[1] - a.point[1];
  const dz = b.point[2] - a.point[2];
  return { dx, dy, dz, dist: Math.hypot(dx, dy, dz) };
}
