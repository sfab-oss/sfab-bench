import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useTheme, type ThemePreference } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function useAppearancePicker() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  const preference: ThemePreference = isThemePreference(theme) ? theme : "system";
  const pick = useCallback(
    (next: ThemePreference) => {
      setTheme(next);
    },
    [setTheme],
  );
  return { dark, preference: mounted ? preference : "system", pick };
}

export function AppearancePicker({ className }: { className?: string }) {
  const { preference, pick } = useAppearancePicker();
  return (
    <Select
      modal={false}
      value={preference}
      items={THEMES.map(({ value, label }) => ({ value, label }))}
      onValueChange={(value: string | null) => {
        if (isThemePreference(value)) pick(value);
      }}
    >
      <SelectTrigger
        aria-label="Appearance"
        className={className ?? "h-8 w-full justify-between px-2 text-sm text-foreground"}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" side="top" className="min-w-40">
        {THEMES.map(({ value, label }) => (
          <SelectItem key={value} value={value} className="text-sm">
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { dark, pick } = useAppearancePicker();
  const toggle = useCallback(() => pick(dark ? "light" : "dark"), [dark, pick]);

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={className ?? "h-9 w-9 p-0"}
      title={dark ? "Switch to light" : "Switch to dark"}
      onClick={toggle}
    >
      {dark ? <Sun /> : <Moon />}
      <span className="sr-only">{dark ? "Switch to light" : "Switch to dark"}</span>
    </Button>
  );
}
