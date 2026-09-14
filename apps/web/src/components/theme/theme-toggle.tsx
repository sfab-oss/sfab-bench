import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { store } from "@/state/store";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  const toggle = useCallback(() => {
    const next = dark ? "light" : "dark";
    store.getState().setAppearance(next);
    setTheme(next);
  }, [dark, setTheme]);

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
