"use client";

import { createContext, useContext, useEffect, useState, useLayoutEffect } from "react";
import { useSession } from "next-auth/react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const LOCAL_STORAGE_KEY = "theme-preference";

// Check if user prefers dark mode
function getSystemPreference(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Get theme from localStorage
function getThemeFromLocalStorage(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Ignore localStorage errors
  }
  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // Get theme from Keycloak user attributes ( safely access )
  const getThemeFromSession = (): Theme | null => {
    // Access attributes safely from session user
    const user = session?.user as any;
    if (!user?.attributes) return null;
    const darkModeAttr = user.attributes["dark-mode"];
    if (darkModeAttr?.[0] === "Turned ON") return "dark";
    if (darkModeAttr?.[0] === "Turned OFF") return "light";
    return null;
  };

  // Apply theme to DOM
  const applyTheme = (newTheme: Theme) => {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(newTheme);
  };

  // Initialize theme from localStorage, session, or system preference
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const localTheme = getThemeFromLocalStorage();
    const sessionTheme = getThemeFromSession();
    const initialTheme = localTheme ?? sessionTheme ?? getSystemPreference();

    setThemeState(initialTheme);
    applyTheme(initialTheme);
    setMounted(true);
  }, []); // Only run on mount

  // Sync Keycloak theme to localStorage on first session load (if no localStorage value)
  useEffect(() => {
    if (status === "authenticated" && mounted && !getThemeFromLocalStorage()) {
      const sessionTheme = getThemeFromSession();
      if (sessionTheme) {
        setThemeState(sessionTheme);
        applyTheme(sessionTheme);
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, sessionTheme);
        } catch {
          // Ignore localStorage errors
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mounted]);

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);

    // Save to localStorage for immediate persistence
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, newTheme);
    } catch {
      // Ignore localStorage errors
    }

    // Sync to Keycloak if authenticated (background)
    if (status === "authenticated" && session?.accessToken) {
      try {
        await fetch("/api/account", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attributes: {
              "dark-mode": newTheme === "dark" ? ["Turned ON"] : ["Turned OFF"],
            },
          }),
        });
      } catch (err) {
        console.error("Failed to sync theme preference to Keycloak", err);
      }
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isLoading: !mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};
