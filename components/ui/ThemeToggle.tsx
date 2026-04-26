"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

const KEY = "mp_theme";
const COOKIE = "mp_theme";

function readPref(): Theme {
  try {
    const m = document.cookie.match(/(?:^|;\s*)mp_theme=(light|dark)/);
    if (m) return m[1] as Theme;
  } catch {}
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  return "dark";
}

function applyTheme(t: Theme) {
  const html = document.documentElement;
  html.classList.toggle("light", t === "light");
  html.classList.toggle("dark", t === "dark");
}

function persistTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {}
  try {
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${COOKIE}=${t}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {}
}

/**
 * Toggle dark/light. Per-device persistence (cookie + localStorage). Theme
 * jest read przez SSR w app/layout.tsx — renderuje się od pierwszego
 * paintu z prawidłowym themem. Bez animacji żeby nie zaśmiecać UX.
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

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    persistTheme(next);
    void fetch("/api/account/device-theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ theme: next }),
    }).catch(() => {});
  }, [theme]);

  if (!mounted) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Włącz tryb jasny" : "Włącz tryb ciemny"}
      title={theme === "dark" ? "Tryb ciemny — klik = jasny" : "Tryb jasny — klik = ciemny"}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] transition ${className ?? ""}`}
    >
      {theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </button>
  );
}
