import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  CONTRAST_DEFAULT,
  CONTRAST_STORAGE_KEY,
  TEXT_SIZE_STORAGE_KEY,
  applyContrastVars,
  applyTextSize,
  parseContrast,
  parseTextSize,
  type TextSize,
} from "@/lib/settings";

type AppearancePrefs = {
  contrast: number;
  textSize: TextSize;
  setContrast: (next: number) => void;
  setTextSize: (next: TextSize) => void;
  resetContrast: () => void;
  resetTextSize: () => void;
};

const AppearancePrefsContext = createContext<AppearancePrefs | null>(null);

function readStoredContrast(): number {
  try {
    return parseContrast(localStorage.getItem(CONTRAST_STORAGE_KEY));
  } catch {
    return CONTRAST_DEFAULT;
  }
}

function readStoredTextSize(): TextSize {
  try {
    return parseTextSize(localStorage.getItem(TEXT_SIZE_STORAGE_KEY));
  } catch {
    return "default";
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export function useAppearancePrefs(): AppearancePrefs {
  const ctx = useContext(AppearancePrefsContext);
  if (!ctx) throw new Error("useAppearancePrefs must be used within AppearancePrefsProvider");
  return ctx;
}

export function AppearancePrefsProvider({ children }: { children: ReactNode }) {
  const [contrast, setContrastState] = useState(() =>
    typeof window === "undefined" ? CONTRAST_DEFAULT : readStoredContrast(),
  );
  const [textSize, setTextSizeState] = useState<TextSize>(() =>
    typeof window === "undefined" ? "default" : readStoredTextSize(),
  );

  const setContrast = useCallback((next: number) => {
    const value = parseContrast(String(next));
    writeStorage(CONTRAST_STORAGE_KEY, String(value));
    setContrastState(value);
  }, []);

  const setTextSize = useCallback((next: TextSize) => {
    const value = parseTextSize(next);
    writeStorage(TEXT_SIZE_STORAGE_KEY, value);
    setTextSizeState(value);
  }, []);

  const resetContrast = useCallback(() => setContrast(CONTRAST_DEFAULT), [setContrast]);
  const resetTextSize = useCallback(() => setTextSize("default"), [setTextSize]);

  useEffect(() => {
    applyContrastVars(document.documentElement, contrast);
  }, [contrast]);

  useEffect(() => {
    applyTextSize(document.documentElement, textSize);
  }, [textSize]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === CONTRAST_STORAGE_KEY) setContrastState(parseContrast(event.newValue));
      if (event.key === TEXT_SIZE_STORAGE_KEY) setTextSizeState(parseTextSize(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<AppearancePrefs>(
    () => ({ contrast, textSize, setContrast, setTextSize, resetContrast, resetTextSize }),
    [contrast, resetContrast, resetTextSize, setContrast, setTextSize, textSize],
  );

  return <AppearancePrefsContext.Provider value={value}>{children}</AppearancePrefsContext.Provider>;
}
