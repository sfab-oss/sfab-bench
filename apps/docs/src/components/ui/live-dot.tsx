import type * as React from "react";
import { cn } from "@/lib/utils";

function LiveDot({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("h-1.5 w-1.5 rounded-full bg-brand", className)}
      data-slot="live-dot"
      {...props}
    />
  );
}

export { LiveDot };
