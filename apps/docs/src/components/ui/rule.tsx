import type * as React from "react";
import { cn } from "@/lib/utils";

function Rule({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("h-px w-full bg-border", className)}
      data-slot="rule"
      {...props}
    />
  );
}

export { Rule };
