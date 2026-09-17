/**
 * The brand accent as a raw hex literal.
 *
 * In DOM/SVG, prefer the `--brand` CSS custom property (it tracks the theme and
 * lives in `styles.css`). This literal mirrors `--brand: oklch(0.59 0.24 357)`
 * and exists only for `<canvas>`, which paints raw pixels and cannot resolve CSS
 * custom properties.
 */
export const BRAND = "#e4007c";
