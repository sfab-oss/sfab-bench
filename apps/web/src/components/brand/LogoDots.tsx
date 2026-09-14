import type { SVGProps } from "react";

/**
 * SFab six-dot mark. Outer nodes follow `currentColor`; the center is the
 * rosa-mexicano spark (`#e4007c`) unless `accent` is passed. Copied from
 * sfab-oss/sfab — do not stretch, rotate, or flood the whole mark with the accent.
 */
const OUTER = [
  { cx: 127.5, cy: 257.5 },
  { cx: 380.5, cy: 93.5 },
  { cx: 648.5, cy: 455.5 },
  { cx: 380.5, cy: 659.5 },
  { cx: 127.5, cy: 498.5 },
] as const;

export function LogoDots({
  accent = "#e4007c",
  ...props
}: SVGProps<SVGSVGElement> & { accent?: string }) {
  return (
    <svg fill="none" role="img" viewBox="0 0 771 771" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>SFab</title>
      {OUTER.map((node) => (
        <circle cx={node.cx} cy={node.cy} fill="currentColor" key={`${node.cx}-${node.cy}`} r={74} />
      ))}
      <circle cx={380.5} cy={376.5} fill={accent} r={74} />
    </svg>
  );
}
