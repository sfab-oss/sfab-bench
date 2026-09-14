type MeasurePointLike = { point: [number, number, number] };

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
