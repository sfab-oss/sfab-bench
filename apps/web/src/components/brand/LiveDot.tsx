import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** The one live thing: tessellating, pairing, streaming. Not a status colour. */
export function LiveDot({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 shrink-0 rounded-full bg-brand", className)}
      data-slot="live-dot"
      {...props}
    />
  );
}
