import { useAppearancePrefs } from "@/components/theme/appearance-prefs";
import { AppearancePicker } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import type { TextSize } from "@/lib/settings";

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
];

export function AppearanceSection() {
  const { textSize, setTextSize, resetTextSize } = useAppearancePrefs();
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="text-sm font-medium">Theme</div>
        <AppearancePicker />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">Interface text size</div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={textSize === "default"}
            onClick={resetTextSize}
          >
            Reset
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {TEXT_SIZES.map((size) => (
            <Button
              key={size.value}
              type="button"
              size="sm"
              variant={textSize === size.value ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setTextSize(size.value)}
            >
              {size.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
