import type * as React from "react";
import { cn } from "@/lib/utils";

function Pill({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-input px-3 py-[0.3125rem] font-mono text-[0.6875rem] text-muted-foreground uppercase tracking-[0.18em]",
        className
      )}
      data-slot="pill"
      {...props}
    />
  );
}

export { Pill };
