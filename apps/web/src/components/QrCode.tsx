import { renderSVG } from "uqr";

import { cn } from "@/lib/utils";

export function QrCode({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const svg = renderSVG(value, {
    pixelSize: 4,
    border: 2,
    whiteColor: "#ffffff",
    blackColor: "#18181b",
  });
  return (
    <div
      className={cn(
        "aspect-square overflow-hidden rounded-md bg-white [&>svg]:h-full [&>svg]:w-full",
        className
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
