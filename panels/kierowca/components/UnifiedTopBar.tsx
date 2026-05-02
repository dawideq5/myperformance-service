"use client";

import { signOut, useSession } from "next-auth/react";
import { LogOut, User as UserIcon } from "lucide-react";
import { DASHBOARD_HOME_URL } from "@/lib/dashboard-url";
import { NotificationBell } from "@/components/NotificationBell";
import { PanelSearch } from "@/components/PanelSearch";

/**
 * Panel-side TopBar — kompletny: logo (link do dashboardu), tytuł panelu,
 * wyszukiwarka (mock), centrum powiadomień (relay → dashboard inbox), user
 * info, wyloguj.
 *
 * Logo prowadzi do `DASHBOARD_HOME_URL` (osobna aplikacja Next.js — używamy
 * `<a href>` zamiast `<Link>`).
 */
const PANEL_TITLE = "Panel kierowcy";

interface UnifiedTopBarProps {
  title?: string;
  fallbackUserLabel?: string;
  fallbackUserEmail?: string;
}

function getInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function UnifiedTopBar({
  title = PANEL_TITLE,
  fallbackUserLabel,
  fallbackUserEmail,
}: UnifiedTopBarProps = {}) {
  const { data: session, status } = useSession();
  const isAuthed = status === "authenticated";

  const userLabel =
    session?.user?.name ?? session?.user?.email ?? fallbackUserLabel ?? "";
  const userEmail = session?.user?.email ?? fallbackUserEmail ?? "";

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-md"
      style={{
        background: "var(--bg-header, #0f0f16)",
        borderColor: "var(--border-subtle, #1e1e2e)",
      }}
    >
      <div className="mx-auto max-w-7xl px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <a
            href={DASHBOARD_HOME_URL}
            className="flex flex-col leading-tight flex-shrink-0 hover:opacity-90 transition-opacity"
            title="Powrót do MyPerformance dashboard"
            aria-label="MyPerformance — dashboard"
          >
            <span
              className="font-bold text-base sm:text-lg uppercase tracking-wider bg-clip-text text-transparent select-none"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899)",
              }}
            >
              MyPerformance
            </span>
            <span
              className="text-[10px] sm:text-[11px] tracking-wide truncate max-w-[200px]"
              style={{ color: "var(--text-muted, #6b6b7b)" }}
            >
              {title}
            </span>
          </a>

          {isAuthed && <PanelSearch />}
        </div>

        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {isAuthed && <NotificationBell />}

          {isAuthed && userLabel && (
            <div
              className="hidden md:flex items-center gap-2.5 px-2.5 py-1 rounded-xl border"
              style={{
                borderColor: "var(--border-subtle, #1e1e2e)",
                background: "rgba(20, 20, 29, 0.4)",
              }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                }}
                aria-hidden="true"
              >
                {getInitials(userLabel)}
              </div>
              <div className="text-right leading-tight">
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

          {isAuthed && userLabel && (
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
