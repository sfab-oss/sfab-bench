import { cn } from "@/lib/utils";

/** Ellipsize a filesystem path from the start so the last segments stay visible. */
export function StartTruncatedPath({
  path,
  title = path,
  className,
}: {
  path: string;
  title?: string;
  className?: string;
}) {
  return (
    <span className={cn("block min-w-0 truncate", className)} dir="rtl" title={title}>
      <bdi>{path}</bdi>
    </span>
  );
}
