"use client";

import { useEffect, useState } from "react";

/**
 * Wykrywa platformę usera po user-agent. Hydration-safe — zwraca `null`
 * przy SSR i pierwszej hydracji, potem ustawia konkretną wartość. Komponenty
 * powinny renderować neutralny placeholder (np. "Cmd/Ctrl+K") gdy null.
 */
export function usePlatform(): "mac" | "other" | null {
  const [platform, setPlatform] = useState<"mac" | "other" | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    const isMac = /Mac|iPhone|iPad|iPod/i.test(ua);
    setPlatform(isMac ? "mac" : "other");
  }, []);

  return platform;
}

/**
 * Skrót klawiaturowy do wyświetlania w UI ("⌘K" lub "Ctrl+K").
 * Przed hydracją zwraca generic "⌘K" (Mac-first; krótszy string nie skacze
 * layoutowo gdy użytkownik na Windows dostaje pełny "Ctrl+K").
 */
export function useShortcutLabel(key: string): string {
  const platform = usePlatform();
  if (platform === "other") return `Ctrl+${key.toUpperCase()}`;
  return `⌘${key.toUpperCase()}`;
}
