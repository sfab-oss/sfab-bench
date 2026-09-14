export type Appearance = "light" | "dark";

/** Matches `--studio` in `index.css` / the boot script in `index.html`. */
export const STUDIO_HEX: Record<Appearance, string> = {
  light: "#eeeff1",
  dark: "#1a1d21",
};

export function readDomAppearance(): Appearance {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

let apply: ((next: Appearance) => void) | null = null;

/** ThemeSync registers next-themes `setTheme` so XR (inside the R3F tree) can flip CSS too. */
export function bindThemeApplier(fn: ((next: Appearance) => void) | null) {
  apply = fn;
}

export function requestAppearance(next: Appearance) {
  apply?.(next);
}
