import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Mono — the instrument-readout typeface: the manifesto's small labels, codes,
 * and captions. The dominant repeated text style (kickers, station codes, port
 * names, footer links). `size` and `tone` are the axes that actually recur;
 * tracking stays a per-call className since it doesn't track size. `asChild`
 * renders it as an <a>/<p> when needed.
 */
const monoVariants = cva("font-mono", {
  variants: {
    size: {
      xs: "text-[0.625rem]",
      sm: "text-[0.6875rem]",
      md: "text-[0.75rem]",
    },
    tone: {
      muted: "text-muted-foreground",
      brand: "text-brand",
      fg: "text-foreground",
    },
    caps: { true: "uppercase", false: "" },
  },
  defaultVariants: { size: "sm", tone: "muted", caps: false },
});

function Mono({
  className,
  size,
  tone,
  caps,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof monoVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp
      className={cn(monoVariants({ size, tone, caps }), className)}
      data-slot="mono"
      {...props}
    />
  );
}

export { Mono, monoVariants };
