import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * The dark/light switch — shared by the home nav/footer and the brand page.
 * Lives in `components/ui` (not tied to any one page) so nothing has to reach
 * across pages to import it.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [sweeping, setSweeping] = useState(false);

  // next-themes can't know the theme until after hydration; default to dark
  // (the site default) pre-mount and suppress the resulting label mismatch.
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? resolvedTheme !== "light" : true;

  return (
    <button
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      className="relative inline-flex items-center gap-2 overflow-hidden border border-input px-3 py-2 font-mono text-[0.6875rem] text-muted-foreground uppercase tracking-[0.16em] transition-colors hover:text-foreground"
      onClick={() => {
        setSweeping(true);
        setTheme(isDark ? "light" : "dark");
        window.setTimeout(() => setSweeping(false), 360);
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="dotfield pointer-events-none absolute inset-0"
        style={{
          opacity: sweeping ? 0.9 : 0,
          transition: "opacity 320ms steps(5,end)",
        }}
      />
      <span aria-hidden="true" suppressHydrationWarning>
        {isDark ? "☾" : "☀"}
      </span>
      <span suppressHydrationWarning>{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}
