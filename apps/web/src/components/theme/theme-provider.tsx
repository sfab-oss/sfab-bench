import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";

import { bindThemeApplier, STUDIO_HEX, type Appearance } from "@/lib/appearance";
import { desktopBridge } from "@/lib/desktop";
import { store } from "@/state/store";

const STORAGE_KEY = "sfab-bench.theme";

function ThemeSync({ children }: { children: ReactNode }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  useEffect(() => {
    bindThemeApplier((next: Appearance) => setTheme(next));
    return () => bindThemeApplier(null);
  }, [setTheme]);
  useEffect(() => {
    if (resolvedTheme !== "dark" && resolvedTheme !== "light") return;
    store.getState().setAppearance(resolvedTheme);
    const studio = STUDIO_HEX[resolvedTheme];
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", studio);
    if (theme === "light" || theme === "dark" || theme === "system") {
      desktopBridge()?.setTheme?.(theme);
    }
  }, [theme, resolvedTheme]);
  return children;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableColorScheme
      enableSystem
      storageKey={STORAGE_KEY}
    >
      <ThemeSync>{children}</ThemeSync>
    </NextThemesProvider>
  );
}
