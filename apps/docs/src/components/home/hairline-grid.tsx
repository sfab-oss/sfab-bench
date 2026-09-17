import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A grid whose 1px gaps and outer border read as machined hairlines: the
 * wrapper paints the hairline color (`bg-border`) and `gap-px` lets it show
 * through between cells. Cells set their own `bg-background` to sit on top.
 * Column counts come from the caller via `className` (responsive).
 */
function HairlineGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-px border border-border bg-border",
        className
      )}
      data-slot="hairline-grid"
      {...props}
    />
  );
}

export { HairlineGrid };
