import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-12 items-center justify-center gap-2 font-mono text-[0.8125rem] uppercase tracking-[0.06em] [transition-timing-function:steps(3,end)]",
  {
    variants: {
      variant: {
        solid:
          "border border-brand bg-brand px-6 font-bold text-brand-foreground transition-transform hover:translate-y-px active:translate-y-0.5",
        ghost:
          "border border-input px-5 text-foreground transition-colors hover:border-foreground",
      },
    },
    defaultVariants: { variant: "solid" },
  }
);

function Button({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant }), className)}
      data-slot="button"
      data-variant={variant}
      {...props}
    />
  );
}

export { Button, buttonVariants };
