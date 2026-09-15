import { useAppearancePrefs } from "@/components/theme/appearance-prefs";
import { AppearancePicker } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { CONTRAST_DEFAULT, CONTRAST_MAX, CONTRAST_MIN, type TextSize } from "@/lib/settings";

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
];

export function AppearanceSection() {
  const { contrast, textSize, setContrast, setTextSize, resetContrast, resetTextSize } = useAppearancePrefs();
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="text-sm font-medium">Theme</div>
        <AppearancePicker />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="appearance-contrast" className="text-sm font-medium">
            Contrast
          </label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={contrast === CONTRAST_DEFAULT}
            onClick={resetContrast}
          >
            Reset
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <output
            htmlFor="appearance-contrast"
            className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs tabular-nums"
          >
            {contrast}%
          </output>
          <input
            id="appearance-contrast"
            aria-label="Contrast"
            className="min-w-0 flex-1 accent-foreground"
            max={CONTRAST_MAX}
            min={CONTRAST_MIN}
            onChange={(event) => setContrast(Number(event.currentTarget.value))}
            step={5}
            type="range"
            value={contrast}
          />
        </div>
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
