import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { TEXT_SIZE_STORAGE_KEY, applyTextSize, parseTextSize, type TextSize } from "@/lib/settings";

type AppearancePrefs = {
  textSize: TextSize;
  setTextSize: (next: TextSize) => void;
  resetTextSize: () => void;
};

const AppearancePrefsContext = createContext<AppearancePrefs | null>(null);

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
  const [textSize, setTextSizeState] = useState<TextSize>(() =>
    typeof window === "undefined" ? "default" : readStoredTextSize(),
  );

  const setTextSize = useCallback((next: TextSize) => {
    const value = parseTextSize(next);
    writeStorage(TEXT_SIZE_STORAGE_KEY, value);
    setTextSizeState(value);
  }, []);

  const resetTextSize = useCallback(() => setTextSize("default"), [setTextSize]);

  useEffect(() => {
    applyTextSize(document.documentElement, textSize);
  }, [textSize]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === TEXT_SIZE_STORAGE_KEY) setTextSizeState(parseTextSize(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<AppearancePrefs>(
    () => ({ textSize, setTextSize, resetTextSize }),
    [resetTextSize, setTextSize, textSize],
  );

  return <AppearancePrefsContext.Provider value={value}>{children}</AppearancePrefsContext.Provider>;
}
