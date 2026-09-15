import { Kbd } from "@/components/ui/kbd";
import { isMacPlatform } from "@/lib/shortcuts";
import { SHORTCUTS, formatShortcutChips } from "@/lib/shortcuts";

export function ShortcutsSection() {
  const mac = isMacPlatform(
    typeof navigator === "undefined" ? "" : navigator.platform,
    typeof navigator === "undefined" ? "" : navigator.userAgent,
  );
  return (
    <ul className="space-y-2">
      {SHORTCUTS.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-3">
          <span className="text-sm">{row.label}</span>
          <span className="flex shrink-0 items-center gap-1">
            {formatShortcutChips(row.keys, mac).map((chip, index) => (
              <Kbd key={`${row.id}-${chip}-${index}`}>{chip}</Kbd>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
