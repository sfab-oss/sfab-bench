import { Kbd } from "@/components/ui/kbd";
import { isMacPlatform } from "@/lib/files-rail";
import { SETTINGS_SHORTCUTS, formatShortcutChips } from "@/lib/settings";

export function ShortcutsSection() {
  const mac = isMacPlatform(
    typeof navigator === "undefined" ? "" : navigator.platform,
    typeof navigator === "undefined" ? "" : navigator.userAgent,
  );
  return (
    <ul className="space-y-2">
      {SETTINGS_SHORTCUTS.map((row) => (
        <li key={row.action} className="flex items-center justify-between gap-3">
          <span className="text-sm">{row.action}</span>
          <span className="flex shrink-0 items-center gap-1">
            {formatShortcutChips(row.keys, mac).map((chip, index) => (
              <Kbd key={`${row.action}-${chip}-${index}`}>{chip}</Kbd>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
