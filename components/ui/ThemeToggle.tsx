"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

const KEY = "mp_theme";

function readPref(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  // Default dark — to było zachowanie do tej pory
  return "dark";
}

function applyTheme(t: Theme) {
  const html = document.documentElement;
  html.classList.toggle("light", t === "light");
  html.classList.toggle("dark", t === "dark");
}

/**
 * Toggle dark/light. Stan persisted w localStorage.mp_theme.
 * Przed-paint apply: sprytny inline script `<head>` ustawiałby klasę
 * przed React hydration żeby nie było FOUC, ale tu robimy w hooku — flash
 * jest minimalny dla małej palety zmian.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = readPref();
    setTheme(t);
    applyTheme(t);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  }

  if (!mounted) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Włącz tryb jasny" : "Włącz tryb ciemny"}
      title={theme === "dark" ? "Tryb ciemny — klik = jasny" : "Tryb jasny — klik = ciemny"}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] transition ${className ?? ""}`}
    >
      {theme === "dark" ? (
        <Moon className="w-4 h-4" />
      ) : (
        <Sun className="w-4 h-4" />
      )}
    </button>
  );
}
