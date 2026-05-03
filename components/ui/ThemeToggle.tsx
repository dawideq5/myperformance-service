"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

const STORAGE_KEY = "mp-theme";

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" ? "light" : "dark";
}

function applyTheme(next: Theme) {
  const html = document.documentElement;
  html.classList.remove("light", "dark");
  html.classList.add(next);
  html.setAttribute("data-theme", next);
  html.style.colorScheme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {}
}

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  const toggle = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const next: Theme = theme === "dark" ? "light" : "dark";
      const x = event.clientX;
      const y = event.clientY;
      const html = document.documentElement;
      html.style.setProperty("--mp-reveal-x", `${x}px`);
      html.style.setProperty("--mp-reveal-y", `${y}px`);

      type DocumentWithVT = Document & {
        startViewTransition?: (cb: () => void) => { finished?: Promise<void> };
      };
      const doc = document as DocumentWithVT;
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (doc.startViewTransition && !reduceMotion) {
        doc.startViewTransition(() => {
          applyTheme(next);
          setTheme(next);
        });
      } else {
        applyTheme(next);
        setTheme(next);
      }
    },
    [theme],
  );

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Przełącz motyw"
        className={
          className ??
          "p-2.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors"
        }
        suppressHydrationWarning
      >
        <Moon className="w-5 h-5" aria-hidden="true" />
      </button>
    );
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Przełącz na jasny motyw" : "Przełącz na ciemny motyw"}
      title={isDark ? "Jasny motyw" : "Ciemny motyw"}
      className={
        className ??
        "p-2.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors"
      }
    >
      {isDark ? (
        <Sun className="w-5 h-5" aria-hidden="true" />
      ) : (
        <Moon className="w-5 h-5" aria-hidden="true" />
      )}
    </button>
  );
}
