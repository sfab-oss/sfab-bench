import { useTheme } from "next-themes";

/**
 * Resolves the active theme to a boolean for the `<canvas>` renderers, which
 * paint raw pixels and can't read the CSS custom properties that drive the rest
 * of the palette. next-themes is the single source of truth; before hydration
 * `resolvedTheme` is undefined, so we fall back to dark (the site default).
 *
 * Pass the result into a render effect's deps so it re-runs on theme toggle.
 */
export function useIsDark(): boolean {
  const { resolvedTheme } = useTheme();
  return resolvedTheme !== "light";
}
