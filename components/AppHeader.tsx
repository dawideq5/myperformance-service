"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, LogOut, Search, Settings, User as UserIcon } from "lucide-react";
import { Button, PageHeader, ThemeToggle } from "@/components/ui";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";

export interface AppHeaderProps {
  userLabel?: string;
  userSubLabel?: string;
  showAccountLink?: boolean;
  /** When set, renders a back link on the left followed by the title. */
  backHref?: string;
  /** Optional section title shown next to the back link. */
  title?: string;
  /** Extra controls rendered just before the user badge on the right. */
  rightExtras?: ReactNode;
}

export function AppHeader({
  userLabel,
  userSubLabel,
  showAccountLink = true,
  backHref,
  title,
  rightExtras,
}: AppHeaderProps) {
  const { fullLogout } = useAuthRedirect();

  const left = backHref ? (
    <>
      <Link
        href={backHref}
        className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
      >
        <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        <span className="text-sm font-medium">Powrót</span>
      </Link>
      {title && (
        <>
          <div className="h-6 w-px bg-[var(--border-subtle)]" aria-hidden="true" />
          <h1 className="text-xl font-bold text-[var(--text-main)]">{title}</h1>
        </>
      )}
    </>
  ) : (
    <Link
      href="/dashboard"
      className="font-bold text-lg tracking-tight text-[var(--text-main)] select-none"
      aria-label="MyPerformance — pulpit"
    >
      MyPerformance
    </Link>
  );

  return (
    <PageHeader
      left={left}
      right={
        <>
          {rightExtras}
          <button
            type="button"
            data-tour="cmdk-button"
            className="hidden sm:inline-flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] transition"
            aria-label="Wyszukaj globalnie"
            title="Cmd+K (lub Ctrl+K) — szybkie wyszukiwanie"
            onClick={() =>
              window.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "k",
                  metaKey: true,
                  bubbles: true,
                }),
              )
            }
          >
            <Search className="w-3.5 h-3.5" />
            <kbd className="font-mono text-[10px]">⌘K</kbd>
          </button>
          <ThemeToggle className="hidden sm:inline-flex" />
          <NotificationBell />
          {(userLabel || userSubLabel) && (
            <div className="hidden sm:flex items-center gap-3 pr-4 border-r border-[var(--border-subtle)]">
              <div className="w-9 h-9 rounded-full bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
              </div>
              <div className="text-right leading-tight">
                {userLabel && (
                  <p className="text-sm font-medium text-[var(--text-main)]">
                    {userLabel}
                  </p>
                )}
                {userSubLabel && (
                  <p className="text-xs text-[var(--text-muted)]">{userSubLabel}</p>
                )}
              </div>
            </div>
          )}
          {showAccountLink && (
            <Link
              href="/account"
              aria-label="Zarządzaj kontem"
              data-tour="account-link"
              className="p-2.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors"
            >
              <Settings className="w-5 h-5" aria-hidden="true" />
            </Link>
          )}
          <Button
            variant="ghost"
            size="md"
            leftIcon={<LogOut className="w-4 h-4" aria-hidden="true" />}
            onClick={() => void fullLogout()}
          >
            <span className="hidden sm:inline">Wyloguj</span>
          </Button>
        </>
      }
    />
  );
}
