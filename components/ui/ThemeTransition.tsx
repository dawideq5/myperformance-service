"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** Bumpuje przy każdym toggle theme — startuje animację. */
  trigger: number;
  /** Theme docelowy (po przełączeniu). */
  to: "dark" | "light";
}

const DURATION_MS = 2400;

/**
 * Cinematic theme transition — kamera okrąża Ziemię (widok z orbity),
 * w kierunku słońca lub księżyca. UI dashbordu zostaje na wierzchu z
 * lekkim blurem, sam motyw zmienia się płynnie w trakcie animacji
 * (intensywność światła rośnie/maleje sterując zmianą zmiennych CSS).
 *
 * Implementacja: scene jest renderowana jako `position: fixed; z-index: -1`
 * pod całym contentem. Aktywujemy `<html class="mp-theme-running">` które
 * przez CSS sprawia że body staje się przezroczyste — przez chwilę widać
 * Ziemię + niebo zamiast solid bg. Po zakończeniu klasa znika.
 */
export function ThemeTransition({ trigger, to }: Props) {
  const [active, setActive] = useState(false);
  const lastTrigger = useRef(0);

  useEffect(() => {
    if (trigger === lastTrigger.current) return;
    lastTrigger.current = trigger;
    if (trigger === 0) return;

    const root = document.documentElement;
    root.classList.add("mp-theme-running", `mp-theme-running-to-${to}`);
    setActive(true);

    const t = window.setTimeout(() => {
      root.classList.remove("mp-theme-running");
      root.classList.remove("mp-theme-running-to-dark");
      root.classList.remove("mp-theme-running-to-light");
      setActive(false);
    }, DURATION_MS);

    return () => {
      window.clearTimeout(t);
      root.classList.remove("mp-theme-running");
      root.classList.remove("mp-theme-running-to-dark");
      root.classList.remove("mp-theme-running-to-light");
    };
  }, [trigger, to]);

  if (!active) return null;

  return (
    <div className={`mp-theme-scene mp-theme-scene-${to}`} aria-hidden="true">
      {/* Pre-rendered niebo: gwiazdy (dark) lub niebieski gradient (light) */}
      <div className="mp-theme-sky" />

      {/* Dwa ciała niebieskie — jedno po prawej, drugie po lewej; rotacja
          orbitalna kontenera daje wrażenie kamery okrążającej Ziemię. */}
      <div className="mp-theme-orbit">
        <Sun />
        <Moon />
      </div>

      {/* Ziemia widoczna z kosmosu — na środku, statyczna w kadrze. */}
      <Earth />

      {/* Atmosphere haze — cienka warstwa rozjaśniająca gdy słońce widoczne */}
      <div className="mp-theme-atmosphere" />
    </div>
  );
}

function Earth() {
  return (
    <svg
      className="mp-theme-earth"
      viewBox="0 0 600 600"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="earthOcean" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#4a90e2" />
          <stop offset="35%" stopColor="#1e5fa4" />
          <stop offset="70%" stopColor="#0b2d52" />
          <stop offset="100%" stopColor="#020a1a" />
        </radialGradient>
        <radialGradient id="earthAtmRim" cx="50%" cy="50%" r="50%">
          <stop offset="78%" stopColor="#0b2d52" stopOpacity="0" />
          <stop offset="92%" stopColor="#5dade2" stopOpacity="0.35" />
          <stop offset="98%" stopColor="#85c1e9" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#aed6f1" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="earthShadow" cx="80%" cy="60%" r="65%">
          <stop offset="0%" stopColor="#000" stopOpacity="0" />
          <stop offset="60%" stopColor="#000" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.85" />
        </radialGradient>
        <linearGradient id="earthClouds" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="earthBlur"><feGaussianBlur stdDeviation="0.8" /></filter>
      </defs>

      {/* Atmosfera (rim glow) */}
      <circle cx="300" cy="300" r="290" fill="url(#earthAtmRim)" />

      {/* Ocean / podstawa planety */}
      <circle cx="300" cy="300" r="245" fill="url(#earthOcean)" />

      {/* Kontynenty - uproszczone sylwetki w odcieniach zieleni/brązu */}
      <g filter="url(#earthBlur)" opacity="0.85">
        {/* Afryka + Europa (prawa półkula) */}
        <path
          d="M 320 180 Q 360 200 380 240 T 390 320 Q 380 380 360 410 T 320 440 Q 290 430 280 400 T 290 340 Q 295 280 310 220 Z"
          fill="#5d7d3f"
        />
        {/* Azja (góra-prawo) */}
        <path
          d="M 380 170 Q 430 180 460 210 T 470 260 Q 450 280 410 270 T 380 230 Z"
          fill="#7b5e3a"
        />
        {/* Ameryka Pn (lewy górny róg) */}
        <path
          d="M 180 200 Q 220 195 240 230 T 230 290 Q 200 280 180 250 Z"
          fill="#4d6b3a"
        />
        {/* Ameryka Pd */}
        <path
          d="M 195 320 Q 220 330 230 380 T 215 440 Q 200 430 190 390 Z"
          fill="#5d7d3f"
        />
        {/* Australia */}
        <path
          d="M 425 380 Q 460 385 470 405 T 455 425 Q 430 420 420 405 Z"
          fill="#8b6f3f"
        />
      </g>

      {/* Warstwa chmur — delikatna, prawie biała */}
      <g opacity="0.4" filter="url(#earthBlur)">
        <ellipse cx="280" cy="240" rx="55" ry="14" fill="url(#earthClouds)" />
        <ellipse cx="370" cy="290" rx="42" ry="10" fill="url(#earthClouds)" />
        <ellipse cx="240" cy="350" rx="48" ry="12" fill="url(#earthClouds)" />
        <ellipse cx="380" cy="380" rx="35" ry="9" fill="url(#earthClouds)" />
      </g>

      {/* Cień terminator — ciemna strona planety */}
      <circle cx="300" cy="300" r="245" fill="url(#earthShadow)" />
    </svg>
  );
}

function Sun() {
  return (
    <svg
      className="mp-theme-celestial mp-theme-sun"
      viewBox="0 0 240 240"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="sunCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="40%" stopColor="#fde68a" />
          <stop offset="80%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
        <radialGradient id="sunCorona" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef3c7" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#fde68a" stopOpacity="0.45" />
          <stop offset="65%" stopColor="#fb923c" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="120" r="118" fill="url(#sunCorona)" />
      <circle cx="120" cy="120" r="90" fill="url(#sunCorona)" opacity="0.8" />
      <circle cx="120" cy="120" r="60" fill="url(#sunCore)" />
      {/* Solar surface - mottle pattern */}
      <g opacity="0.5">
        <circle cx="100" cy="105" r="6" fill="#fb923c" />
        <circle cx="135" cy="125" r="4" fill="#fb923c" />
        <circle cx="115" cy="140" r="5" fill="#dc2626" opacity="0.6" />
      </g>
    </svg>
  );
}

function Moon() {
  return (
    <svg
      className="mp-theme-celestial mp-theme-moon"
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="moonSurface" cx="35%" cy="35%" r="80%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="40%" stopColor="#cbd5e1" />
          <stop offset="80%" stopColor="#475569" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
        <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="#cbd5e1" stopOpacity="0" />
          <stop offset="85%" stopColor="#cbd5e1" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#94a3b8" stopOpacity="0" />
        </radialGradient>
        <filter id="moonShadowBlur"><feGaussianBlur stdDeviation="1.2" /></filter>
      </defs>
      <circle cx="100" cy="100" r="95" fill="url(#moonGlow)" />
      <circle cx="100" cy="100" r="78" fill="url(#moonSurface)" />
      {/* Realistyczne kratery */}
      <g filter="url(#moonShadowBlur)">
        <circle cx="68" cy="78" r="11" fill="#475569" opacity="0.55" />
        <circle cx="118" cy="68" r="6" fill="#475569" opacity="0.45" />
        <circle cx="138" cy="115" r="13" fill="#475569" opacity="0.55" />
        <circle cx="82" cy="135" r="9" fill="#475569" opacity="0.5" />
        <circle cx="100" cy="105" r="4" fill="#475569" opacity="0.4" />
        <circle cx="125" cy="142" r="3" fill="#475569" opacity="0.4" />
        <circle cx="58" cy="118" r="5" fill="#475569" opacity="0.4" />
        <circle cx="148" cy="80" r="3" fill="#475569" opacity="0.35" />
      </g>
      {/* Highlight punkty (ledwie widoczne) */}
      <circle cx="78" cy="60" r="4" fill="#fff" opacity="0.15" />
      <circle cx="125" cy="50" r="2" fill="#fff" opacity="0.1" />
    </svg>
  );
}
