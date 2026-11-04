import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "dark" | "light" | "system";

type ThemeProviderState = {
  setTheme: (theme: Theme) => void;
  theme: Theme;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

const STORAGE_KEY = "starter-theme";

function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = window.document.documentElement;
  const resolved = theme === "system" ? getSystemTheme() : theme;

  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children, defaultTheme = "system" }: { children: ReactNode; defaultTheme?: Theme }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") {
      return stored;
    }

    return defaultTheme;
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyTheme("system");
    };

    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, [theme]);

  const value = useMemo(
    () => ({
      setTheme: (next: Theme) => {
        localStorage.setItem(STORAGE_KEY, next);
        setThemeState(next);
      },
      theme,
    }),
    [theme]
  );

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
