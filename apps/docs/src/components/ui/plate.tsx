import type * as React from "react";
import { cn } from "@/lib/utils";

/** An engraved plate — a labeled part, never a card-with-shadow. */
function Plate({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("relative border border-border bg-muted/40", className)}
      data-slot="plate"
      {...props}
    />
  );
}

export { Plate };
