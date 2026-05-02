"use client";

import { signOut } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, LogOut, User as UserIcon } from "lucide-react";
import { DASHBOARD_HOME_URL } from "@/lib/dashboard-url";

/**
 * Uproszczona wersja UnifiedTopBar dla paneli (sprzedawca/serwisant/kierowca).
 *
 * Panele mają osobny tsconfig + osobny SessionProvider (NextAuth basePath
 * `/panel/sprzedawca/api/auth`), nie mają NotificationBell ani admin-auth
 * helperów. TopBar paneli zawiera tylko: logo morph, user info, logout.
 *
 * Animacja logo (morphing liter) jest 1:1 z głównego repo.
 */

function viewNameForPath(pathname: string): string {
  if (pathname.startsWith("/panel/sprzedawca")) return "Panel sprzedawcy";
  if (pathname.startsWith("/panel/serwisant")) return "Panel serwisanta";
  if (pathname.startsWith("/panel/kierowca")) return "Panel kierowcy";
  return "MyPerformance";
}

function AnimatedLogoMorph({
  primary,
  secondary,
  intervalMs = 2000,
  durationMs = 600,
}: {
  primary: string;
  secondary: string;
  intervalMs?: number;
  durationMs?: number;
}) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    setPhase(0);
  }, [secondary]);

  useEffect(() => {
    if (!secondary || secondary === primary) return;
    const id = window.setInterval(() => {
      setPhase((p) => (p === 0 ? 1 : 0));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [primary, secondary, intervalMs]);

  const current = phase === 0 ? primary : secondary;
  const previous = phase === 0 ? secondary : primary;

  const positions = useMemo(() => {
    const max = Math.max(current.length, previous.length);
    const arr: Array<{
      idx: number;
      letter: string;
      kind: "stable" | "enter" | "exit";
    }> = [];
    for (let i = 0; i < max; i++) {
      const letter = current[i] ?? "";
      const prevLetter = previous[i] ?? "";
      let kind: "stable" | "enter" | "exit" = "stable";
      if (letter && !prevLetter) kind = "enter";
      else if (!letter && prevLetter) kind = "exit";
      else if (letter !== prevLetter) kind = "enter";
      arr.push({ idx: i, letter, kind });
    }
    return arr;
  }, [current, previous]);

  return (
    <span
      className="inline-flex items-center font-bold text-base sm:text-lg tracking-tight select-none"
      aria-label={current}
    >
      {positions.map(({ idx, letter, kind }) => (
        <span
          key={idx}
          className="inline-block"
          style={{
            minWidth: letter ? undefined : "0.35em",
            transition: `transform ${durationMs}ms cubic-bezier(0.34,1.56,0.64,1), opacity ${durationMs}ms ease-out`,
            transform: kind === "exit" ? "translateY(16px)" : "translateY(0)",
            opacity: letter ? 1 : 0,
            animation:
              kind === "enter"
                ? `mp-letter-drop ${durationMs}ms ease-out`
                : undefined,
          }}
        >
          {letter || "\u00A0"}
        </span>
      ))}
    </span>
  );
}

interface UnifiedTopBarProps {
  userLabel?: string;
  userEmail?: string;
  /** Pathname jeśli jest dostępny — domyślnie window.location.pathname. */
  pathname?: string;
}

export function UnifiedTopBar({
  userLabel,
  userEmail,
  pathname,
}: UnifiedTopBarProps) {
  const [resolvedPath, setResolvedPath] = useState(pathname ?? "/panel");

  useEffect(() => {
    if (pathname) return;
    if (typeof window !== "undefined") {
      setResolvedPath(window.location.pathname);
    }
  }, [pathname]);

  const viewName = viewNameForPath(resolvedPath);
  const initials = userLabel
    ? userLabel
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("")
    : "?";

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-md"
      style={{
        background: "var(--bg-header, #0f0f16)",
        borderColor: "var(--border-subtle, #1e1e2e)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <a
            href={DASHBOARD_HOME_URL}
            className="flex items-center gap-2 flex-shrink-0"
            style={{ color: "var(--text-muted, #6b6b7b)" }}
            title="Powrót do dashboardu"
            aria-label="Powrót do MyPerformance dashboard"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          </a>
          <div style={{ color: "var(--text-main, #f1f1f4)" }}>
            <AnimatedLogoMorph primary="MyPerformance" secondary={viewName} />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {userLabel && (
            <div
              className="hidden md:flex items-center gap-2.5 px-2.5 py-1 rounded-xl border"
              style={{
                borderColor: "var(--border-subtle, #1e1e2e)",
                background: "rgba(20, 20, 29, 0.4)",
              }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                }}
                aria-hidden="true"
              >
                {initials}
              </div>
              <div className="leading-tight text-right">
                <p
                  className="text-xs font-medium truncate max-w-[160px]"
                  style={{ color: "var(--text-main, #f1f1f4)" }}
                >
                  {userLabel}
                </p>
                {userEmail && (
                  <p
                    className="text-[10px] truncate max-w-[160px]"
                    style={{ color: "var(--text-muted, #6b6b7b)" }}
                  >
                    {userEmail}
                  </p>
                )}
              </div>
            </div>
          )}
          {userLabel && (
            <div
              className="flex md:hidden items-center gap-1.5 px-2 py-1 rounded-lg"
              style={{ background: "var(--bg-surface, #14141d)" }}
            >
              <UserIcon
                className="w-4 h-4"
                style={{ color: "var(--accent, #6366f1)" }}
                aria-hidden="true"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors hover:opacity-90"
            style={{ color: "var(--text-muted, #6b6b7b)" }}
            aria-label="Wyloguj"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Wyloguj</span>
          </button>
        </div>
      </div>
    </header>
  );
}
