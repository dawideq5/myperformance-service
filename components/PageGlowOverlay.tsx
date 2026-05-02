"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Border-glow effect — przy każdej zmianie pathname rysuje na 1.2s świecącą
 * ramkę wokół całego viewportu. Pure CSS keyframes (klasa `mp-page-glow-flow`
 * zdefiniowana w globals.css).
 */
export function PageGlowOverlay() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  // `key` wymusza remount overlay'a przy każdej zmianie ścieżki — animacja
  // wystartuje od początku zamiast lecieć dalej z poprzedniego stanu.
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    setActive(true);
    setAnimKey((k) => k + 1);
    const t = window.setTimeout(() => setActive(false), 1200);
    return () => window.clearTimeout(t);
  }, [pathname]);

  if (!active) return null;

  return (
    <div
      key={animKey}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[2200] mp-page-glow-flow"
    />
  );
}
