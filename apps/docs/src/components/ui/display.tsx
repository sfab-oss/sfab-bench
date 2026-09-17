import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

function Display({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"h2"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "h2";
  return (
    <Comp
      className={cn(
        "text-balance font-display font-normal leading-[0.98] tracking-[-0.04em]",
        className
      )}
      data-slot="display"
      {...props}
    />
  );
}

export { Display };
