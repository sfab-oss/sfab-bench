import { cn } from "@/lib/utils";
import type * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-16 w-full rounded-md border border-zinc-200 bg-transparent px-2.5 py-2 text-sm shadow-xs outline-none placeholder:text-zinc-400 focus-visible:border-zinc-400 focus-visible:ring-1 focus-visible:ring-zinc-400",
        className,
      )}
      data-slot="textarea"
      {...props}
    />
  );
}

export { Textarea };
