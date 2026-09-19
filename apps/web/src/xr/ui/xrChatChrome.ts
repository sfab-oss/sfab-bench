export const XR_COMPOSER_MIN_H = 36;
export const XR_COMPOSER_MAX_H = 120;
export const XR_COMPOSER_LINE_H = 18;
export const XR_COMPOSER_PAD_Y = 16;
/** Approx chars that fit 14px in the Quest composer (~248px field). */
export const XR_COMPOSER_CHARS_PER_LINE = 32;

/** Capped growing height for the Quest composer. Newlines and wraps both count. */
export function xrComposerHeight(
  text: string,
  charsPerLine = XR_COMPOSER_CHARS_PER_LINE
): number {
  const per = Math.max(1, charsPerLine);
  const parts = text.split("\n");
  let lines = 0;
  for (const part of parts) {
    lines += Math.max(1, Math.ceil(part.length / per));
  }
  return Math.min(
    XR_COMPOSER_MAX_H,
    Math.max(XR_COMPOSER_MIN_H, lines * XR_COMPOSER_LINE_H + XR_COMPOSER_PAD_Y)
  );
}
