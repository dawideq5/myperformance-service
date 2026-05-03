"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, LogOut, Search, Settings, User as UserIcon } from "lucide-react";
import { Breadcrumbs, Button, PageHeader, ThemeToggle, type Crumb } from "@/components/ui";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import { usePlatform } from "@/hooks/usePlatform";

export interface AppHeaderProps {
  userLabel?: string;
  userSubLabel?: string;
  showAccountLink?: boolean;
  /**
   * Cel strzałki „Powrót". Gdy `parentHref` NIE jest ustawione, działa
   * smart-back (router.back z historii sesji) — `backHref` jest fallbackiem.
   * Gdy `parentHref` JEST ustawione (jawne breadcrumbs), strzałka idzie
   * dosłownie do `backHref` (zwykle `/dashboard`) i pomija history —
   * inaczej powstaje pętla hub ↔ sub-page.
   */
  backHref?: string;
  /** Optional section title shown next to the back link. */
  title?: string;
  /**
   * Element nadrzędny w hierarchii (np. `/admin/config` → "Konfiguracja").
   * Gdy podany razem z `parentLabel` i `title`, w nagłówku pojawia się
   * breadcrumb: Dashboard / Konfiguracja / Typy napraw. Aktywuje też
   * „explicit-back": strzałka „Powrót" pomija router.back() i zawsze
   * kieruje pod `backHref` — przewidywalne wyjście z hierarchii.
   */
  parentHref?: string;
  parentLabel?: string;
  /** Extra controls rendered just before the user badge on the right. */
  rightExtras?: ReactNode;
}

export function AppHeader({
  userLabel,
  // userSubLabel celowo nieużywane — email pominięty w awatarze
  // dla minimalistycznego wyglądu. Prop zachowany dla kompatybilności z callerami.
  userSubLabel: _userSubLabel,
  showAccountLink = true,
  backHref,
  title,
  parentHref,
  parentLabel,
  rightExtras,
}: AppHeaderProps) {
  const { fullLogout } = useAuthRedirect();
  const router = useRouter();
  const platform = usePlatform();
  const shortcutKey = platform === "other" ? "Ctrl+K" : "⌘K";

  // Smart back: jeśli mamy poprzednią stronę w historii sesji (referrer
  // z tego samego origin), router.back() zachowa kontekst (np. powrót
  // z /admin/locations/X do /admin/config). Bez historii — fallback do
  // backHref (zazwyczaj /dashboard albo logiczny rodzic).
  //
  // WAŻNE: gdy strona deklaruje jawną hierarchię (parentHref ustawione,
  // czyli mamy breadcrumbs), wyłączamy router.back() — inaczej rodzi to
  // pętlę: /admin/config (hub) → /admin/repair-types → klik Powrót →
  // router.back() wraca do /admin/config → klik kafelka → znowu sub-page…
  // Przy hierarchii jawnej strzałka „Powrót" musi prowadzić do `backHref`
  // (zwykle /dashboard) — przewidywalne wyjście z drzewa, niezależne od
  // historii nawigacji. Breadcrumbs dają granularną drogę do rodzica.
  const handleBack = (e: React.MouseEvent) => {
    if (typeof window === "undefined") return;
    if (parentHref) return; // explicit hierarchy — Link → backHref
    const ref = document.referrer;
    const sameOriginHistory =
      ref && ref.startsWith(window.location.origin) && window.history.length > 1;
    if (sameOriginHistory) {
      e.preventDefault();
      router.back();
    }
    // else: zostawiamy default <Link href={backHref}> behavior
  };

  // Breadcrumbs (Dashboard / Parent / Title) renderujemy tylko jeśli mamy
  // pełen łańcuch: parentHref + parentLabel + title. Komponent `Breadcrumbs`
  // sam dodaje element "Dashboard" jako Home na początku, więc lista to
  // [parent, current].
  const showBreadcrumbs = Boolean(parentHref && parentLabel && title);
  const crumbs: Crumb[] = showBreadcrumbs
    ? [
        { label: parentLabel as string, href: parentHref },
        { label: title as string },
      ]
    : [];

  const left = backHref ? (
    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
      <Link
        href={backHref}
        onClick={handleBack}
        className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors flex-shrink-0"
      >
        <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        <span className="text-sm font-medium hidden sm:inline">Powrót</span>
      </Link>
      {title && (
        <>
          <div className="h-6 w-px bg-[var(--border-subtle)] flex-shrink-0" aria-hidden="true" />
          <div className="flex flex-col min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-[var(--text-main)] truncate">
              {title}
            </h1>
            {showBreadcrumbs && (
              // Breadcrumbs widoczne też na mobile — to jedyna jawna
              // ścieżka do dashboard/rodzica (Home icon = /dashboard);
              // arrow jest tylko dla rodzica/dashboardu.
              <Breadcrumbs items={crumbs} />
            )}
          </div>
        </>
      )}
    </div>
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
            title={`${shortcutKey} — szybkie wyszukiwanie`}
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
            <kbd className="font-mono text-[10px]">{shortcutKey}</kbd>
          </button>
          <span data-tour="theme-toggle" className="hidden sm:inline-flex">
            <ThemeToggle />
          </span>
          <span data-tour="bell">
            <NotificationBell />
          </span>
          {userLabel && (
            <div className="hidden sm:flex items-center gap-3 pr-4 border-r border-[var(--border-subtle)]">
              <div className="w-9 h-9 rounded-full bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-[var(--text-main)] leading-tight">
                {userLabel}
              </p>
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
