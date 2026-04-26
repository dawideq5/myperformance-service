"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** Bumpuje przy każdym toggle theme — startuje animację. */
  trigger: number;
  /** Theme docelowy (po przełączeniu). */
  to: "dark" | "light";
}

/**
 * Pełnoekranowa, kinowa animacja przejścia między trybami:
 *
 *   ciemny → jasny: planeta-księżyc obraca się znikając w dół, w tym czasie
 *     z prawej wschodzi słońce z koroną i lens-flare
 *   jasny → ciemny: słońce zachodzi w lewo, księżyc wschodzi z prawej
 *     z gwiazdami i mgławicą
 *
 * Implementacja CSS-only (SVG + keyframes) — żadnych canvas/WebGL żeby
 * nie ciągnąć runtime kosztu i nie blokować TTI. Czas trwania ~1.6s,
 * `pointer-events: none` na overlayu, `prefers-reduced-motion` skraca do
 * cross-fade.
 */
export function ThemeTransition({ trigger, to }: Props) {
  const [active, setActive] = useState(false);
  const lastTrigger = useRef(0);

  useEffect(() => {
    if (trigger === lastTrigger.current) return;
    lastTrigger.current = trigger;
    if (trigger === 0) return; // skip initial mount
    setActive(true);
    const t = window.setTimeout(() => setActive(false), 1700);
    return () => window.clearTimeout(t);
  }, [trigger]);

  if (!active) return null;

  return (
    <div
      className={`mp-theme-transition mp-theme-${to}`}
      aria-hidden="true"
      role="presentation"
    >
      <div className="mp-theme-bg" />
      <div className="mp-theme-stars">
        {Array.from({ length: 60 }).map((_, i) => (
          <span
            key={i}
            className="mp-theme-star"
            style={
              {
                "--x": `${Math.random() * 100}%`,
                "--y": `${Math.random() * 100}%`,
                "--d": `${0.3 + Math.random() * 1.2}s`,
                "--s": `${0.5 + Math.random() * 2}px`,
                "--o": Math.random() * 0.6 + 0.2,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="mp-theme-clouds">
        <div className="mp-theme-cloud mp-theme-cloud-a" />
        <div className="mp-theme-cloud mp-theme-cloud-b" />
        <div className="mp-theme-cloud mp-theme-cloud-c" />
      </div>

      <svg
        className="mp-theme-celestial mp-theme-moon"
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="moonBody" cx="35%" cy="35%" r="80%">
            <stop offset="0%" stopColor="#fefce8" />
            <stop offset="40%" stopColor="#fde68a" />
            <stop offset="80%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#1e293b" />
          </radialGradient>
          <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fde68a" stopOpacity="0.55" />
            <stop offset="40%" stopColor="#a78bfa" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#0b1020" stopOpacity="0" />
          </radialGradient>
          <filter id="moonShadow">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>
        <circle cx="100" cy="100" r="98" fill="url(#moonGlow)" />
        <circle cx="100" cy="100" r="78" fill="url(#moonBody)" />
        {/* kratery */}
        <circle cx="70" cy="80" r="9" fill="#94a3b8" opacity="0.55" filter="url(#moonShadow)" />
        <circle cx="120" cy="70" r="6" fill="#94a3b8" opacity="0.45" />
        <circle cx="140" cy="115" r="11" fill="#94a3b8" opacity="0.5" filter="url(#moonShadow)" />
        <circle cx="85" cy="135" r="7" fill="#94a3b8" opacity="0.45" />
        <circle cx="100" cy="105" r="4" fill="#94a3b8" opacity="0.4" />
        <circle cx="125" cy="140" r="3" fill="#94a3b8" opacity="0.4" />
        <circle cx="60" cy="115" r="4" fill="#94a3b8" opacity="0.35" />
      </svg>

      <svg
        className="mp-theme-celestial mp-theme-sun"
        viewBox="0 0 240 240"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="sunBody" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fffbeb" />
            <stop offset="50%" stopColor="#fde047" />
            <stop offset="100%" stopColor="#f97316" />
          </radialGradient>
          <radialGradient id="sunHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fde047" stopOpacity="0.7" />
            <stop offset="35%" stopColor="#fb923c" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#fef3c7" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* korona słoneczna */}
        <circle cx="120" cy="120" r="118" fill="url(#sunHalo)" />
        <circle cx="120" cy="120" r="95" fill="url(#sunHalo)" opacity="0.85" />
        {/* tarcza */}
        <circle cx="120" cy="120" r="64" fill="url(#sunBody)" />
        {/* promienie */}
        <g
          stroke="#fde047"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.85"
        >
          <line x1="120" y1="20" x2="120" y2="44" />
          <line x1="120" y1="220" x2="120" y2="196" />
          <line x1="20" y1="120" x2="44" y2="120" />
          <line x1="220" y1="120" x2="196" y2="120" />
          <line x1="49" y1="49" x2="66" y2="66" />
          <line x1="191" y1="49" x2="174" y2="66" />
          <line x1="49" y1="191" x2="66" y2="174" />
          <line x1="191" y1="191" x2="174" y2="174" />
        </g>
      </svg>

      <div className="mp-theme-flare" />
    </div>
  );
}
