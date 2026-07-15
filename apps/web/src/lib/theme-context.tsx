"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "ai_pdf_workspace_theme";

const DEFAULT_THEME: Theme = "dark";

type ThemeClassList = {
  contains(token: string): boolean;
  toggle(token: string, force?: boolean): boolean;
};

type ThemeDocumentElement = {
  classList: ThemeClassList;
};

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

type ThemeEnvironment = {
  documentElement?: ThemeDocumentElement | null;
  storage?: ThemeStorage | null;
};

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function getBrowserStorage(): ThemeStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getBrowserDocumentElement(): ThemeDocumentElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  return document.documentElement;
}

export function resolveTheme(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : DEFAULT_THEME;
}

export function getInitialTheme(environment: ThemeEnvironment = {}): Theme {
  const storage = environment.storage === undefined ? getBrowserStorage() : environment.storage;

  try {
    return resolveTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function syncTheme(theme: Theme, environment: ThemeEnvironment = {}): void {
  const documentElement =
    environment.documentElement === undefined
      ? getBrowserDocumentElement()
      : environment.documentElement;
  documentElement?.classList.toggle("dark", theme === "dark");

  const storage = environment.storage === undefined ? getBrowserStorage() : environment.storage;
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme changes must still apply when browser storage is unavailable.
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useIsomorphicLayoutEffect(() => {
    syncTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
