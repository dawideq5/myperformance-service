// Theme toggle (dark/light) — re-implementation of design-handoff/theme.js
// + ThemeToggle.jsx for the Keycloakify React bundle. Persists choice in
// localStorage under "mp-theme" (same key the dashboard uses) so a user
// who flipped to light on the dashboard sees the same theme on the
// Keycloak login screen. Sets data-theme + .dark/.light on <html>.
//
// Uses the View Transitions API for a circular reveal where supported,
// falls back to the global CSS color-mix crossfade otherwise.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mp-theme";

type Theme = "dark" | "light";

function readStored(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function writeStored(t: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, t);
  } catch {
    // localStorage may be blocked in some embed contexts — fail silent
  }
}

function applyTheme(t: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", t);
  root.classList.toggle("dark", t === "dark");
  root.classList.toggle("light", t === "light");
}

type StartViewTransitionFn = (cb: () => void) => unknown;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  // Initial hydration — read storage, apply, suppress crossfade for the
  // very first paint so we don't animate from default-dark to user-light.
  useEffect(() => {
    const stored = readStored() ?? "dark";
    const root = document.documentElement;
    root.classList.add("no-theme-transition");
    applyTheme(stored);
    setTheme(stored);
    requestAnimationFrame(() => {
      requestAnimationFrame(() =>
        root.classList.remove("no-theme-transition"),
      );
    });
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const next: Theme = theme === "dark" ? "light" : "dark";

      // View Transitions: reveal centred on the click coords.
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      document.documentElement.style.setProperty("--mp-cx", `${cx}px`);
      document.documentElement.style.setProperty("--mp-cy", `${cy}px`);

      const startVT = (
        document as unknown as { startViewTransition?: StartViewTransitionFn }
      ).startViewTransition;
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const commit = () => {
        applyTheme(next);
        writeStored(next);
        setTheme(next);
      };

      if (typeof startVT === "function" && !reduce) {
        startVT.call(document, commit);
      } else {
        commit();
      }
    },
    [theme],
  );

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="mp-themetoggle"
      onClick={handleClick}
      aria-label={
        isDark ? "Przełącz na motyw jasny" : "Przełącz na motyw ciemny"
      }
      title={isDark ? "Motyw jasny" : "Motyw ciemny"}
    >
      <span
        className={`mp-themetoggle__icon mp-themetoggle__icon--sun${
          !isDark ? " is-active" : ""
        }`}
        aria-hidden="true"
      >
        <SunIcon />
      </span>
      <span
        className={`mp-themetoggle__icon mp-themetoggle__icon--moon${
          isDark ? " is-active" : ""
        }`}
        aria-hidden="true"
      >
        <MoonIcon />
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
