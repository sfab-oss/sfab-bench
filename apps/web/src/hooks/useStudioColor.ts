import { useTheme } from "@/components/theme/theme-provider";
import { useEffect, useState } from "react";

import { readDomAppearance, STUDIO_HEX } from "@/lib/appearance";

/** CSS `--studio`, so the Three.js clear colour matches the page. */
export function useStudioColor(): string {
  const { resolvedTheme } = useTheme();
  const [color, setColor] = useState(() => STUDIO_HEX[readDomAppearance()]);
  useEffect(() => {
    if (resolvedTheme !== "dark" && resolvedTheme !== "light") return;
    setColor(STUDIO_HEX[resolvedTheme]);
  }, [resolvedTheme]);
  return color;
}
