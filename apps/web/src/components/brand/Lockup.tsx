import { LogoDots } from "@/components/brand/LogoDots";
import { cn } from "@/lib/utils";

/** Mark + SFab + a small product tag. Same shape as SFab's docs/home lockup. */
export function Lockup({
  className,
  markClassName,
  tag = "BENCH",
}: {
  className?: string;
  markClassName?: string;
  tag?: string | null;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoDots aria-hidden className={cn("size-5 shrink-0 text-zinc-900", markClassName)} />
      <span className="text-sm font-semibold tracking-[-0.01em] text-zinc-900">SFab</span>
      {tag ? (
        <span className="font-mono text-[0.625rem] font-medium uppercase tracking-[0.2em] text-zinc-400">
          {tag}
        </span>
      ) : null}
    </span>
  );
}
