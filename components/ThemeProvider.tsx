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

// Check if user prefers dark mode
function getSystemPreference(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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

  // Initialize theme from session or system preference
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const sessionTheme = getThemeFromSession();
    const initialTheme = sessionTheme ?? getSystemPreference();

    setThemeState(initialTheme);
    applyTheme(initialTheme);
    setMounted(true);
  }, [session]);

  // Update theme when session changes
  useEffect(() => {
    if (status === "authenticated") {
      const sessionTheme = getThemeFromSession();
      if (sessionTheme && sessionTheme !== theme) {
        setThemeState(sessionTheme);
        applyTheme(sessionTheme);
      }
    }
  }, [session, status]);

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);

    // Save to Keycloak if authenticated
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
        console.error("Failed to save theme preference", err);
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
