"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  BookMarked,
  Briefcase,
  Calendar,
  Database,
  FileSignature,
  GraduationCap,
  Grid3x3,
  KeyRound,
  LogOut,
  Mail,
  MessageSquare,
  Search,
  Server,
  Settings,
  Shield,
  Tags,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Button, ThemeToggle } from "@/components/ui";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import { usePlatform } from "@/hooks/usePlatform";
import {
  canAccessCalendar,
  canAccessChatwootAsAdmin,
  canAccessChatwootAsAgent,
  canAccessConfigHub,
  canAccessDirectus,
  canAccessDocumensoAsAdmin,
  canAccessDocumensoAsManager,
  canAccessDocumensoAsMember,
  canAccessEmail,
  canAccessInfrastructure,
  canAccessKeycloakAdmin,
  canAccessKnowledgeBase,
  canAccessMoodleAsAdmin,
  canAccessMoodleAsStudent,
  canAccessMoodleAsTeacher,
  canAccessPanel,
  canAccessPostal,
  canManageCertificates,
} from "@/lib/admin-auth";
import type { Session } from "next-auth";

/**
 * Mapowanie pathname → nazwa widoku pokazywana jako subtitle pod logo.
 *
 * Sprawdzamy od najbardziej szczegółowego do najogólniejszego (longest-match
 * via sortowanie).
 */
const PATH_VIEW_NAMES: Array<[string, string]> = [
  ["/dashboard/calendar", "Kalendarz"],
  ["/dashboard", "Dashboard"],
  ["/admin/pricelist", "Cennik"],
  ["/admin/repair-types", "Typy napraw"],
  ["/admin/announcements", "Komunikaty"],
  ["/admin/config", "Konfiguracja"],
  ["/admin/users", "Użytkownicy"],
  ["/admin/groups", "Grupy"],
  ["/admin/email", "Email i branding"],
  ["/admin/infrastructure", "Infrastruktura"],
  ["/admin/locations", "Lokalizacje"],
  ["/admin/certificates", "Certyfikaty"],
  ["/admin/security", "Bezpieczeństwo"],
  ["/admin/keycloak", "Keycloak"],
  ["/account", "Moje konto"],
  ["/panel/sprzedawca", "Panel sprzedawcy"],
  ["/panel/serwisant", "Panel serwisanta"],
  ["/panel/kierowca", "Panel kierowcy"],
];

function viewNameForPath(pathname: string | null): string {
  if (!pathname) return "Dashboard";
  // Sortujemy malejąco po długości → longest-match wins.
  const sorted = [...PATH_VIEW_NAMES].sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, name] of sorted) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return name;
  }
  return "MyPerformance";
}

interface ToolItem {
  id: string;
  label: string;
  Icon: LucideIcon;
  iconColor: string;
  href: string;
  external?: boolean;
  show: (session: Session | null) => boolean;
}

/** Lista narzędzi w menu Tools — dokładnie te kafelki dashboardu, które user
 *  może otworzyć (filtrowane przez admin-auth helpery). */
const TOOL_CATALOG: ToolItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    Icon: Grid3x3,
    iconColor: "text-indigo-400",
    href: "/dashboard",
    show: () => true,
  },
  {
    id: "calendar",
    label: "Kalendarz",
    Icon: Calendar,
    iconColor: "text-blue-400",
    href: "/dashboard/calendar",
    show: canAccessCalendar,
  },
  {
    id: "panel-sprzedawca",
    label: "Panel sprzedawcy",
    Icon: Briefcase,
    iconColor: "text-sky-400",
    href: "/panel/sprzedawca/launch",
    external: true,
    show: (s) => canAccessPanel(s, "sprzedawca"),
  },
  {
    id: "panel-serwisant",
    label: "Panel serwisanta",
    Icon: Wrench,
    iconColor: "text-rose-400",
    href: "/panel/serwisant/launch",
    external: true,
    show: (s) => canAccessPanel(s, "serwisant"),
  },
  {
    id: "panel-kierowca",
    label: "Panel kierowcy",
    Icon: Truck,
    iconColor: "text-lime-400",
    href: "/panel/kierowca/launch",
    external: true,
    show: (s) => canAccessPanel(s, "kierowca"),
  },
  {
    id: "directus",
    label: "Directus",
    Icon: Database,
    iconColor: "text-emerald-400",
    href: "/api/directus/launch",
    external: true,
    show: canAccessDirectus,
  },
  {
    id: "documenso",
    label: "Dokumenty",
    Icon: FileSignature,
    iconColor: "text-purple-400",
    href: "/api/documenso/sso",
    external: true,
    show: (s) =>
      canAccessDocumensoAsAdmin(s) ||
      canAccessDocumensoAsManager(s) ||
      canAccessDocumensoAsMember(s),
  },
  {
    id: "moodle",
    label: "Akademia",
    Icon: GraduationCap,
    iconColor: "text-amber-400",
    href: "/api/moodle/launch",
    external: true,
    show: (s) =>
      canAccessMoodleAsAdmin(s) ||
      canAccessMoodleAsTeacher(s) ||
      canAccessMoodleAsStudent(s),
  },
  {
    id: "knowledge",
    label: "Baza wiedzy",
    Icon: BookMarked,
    iconColor: "text-teal-400",
    href: "/api/outline/launch",
    external: true,
    show: canAccessKnowledgeBase,
  },
  {
    id: "chatwoot",
    label: "Chatwoot",
    Icon: MessageSquare,
    iconColor: "text-sky-400",
    href: "/api/chatwoot/sso",
    external: true,
    show: (s) => canAccessChatwootAsAdmin(s) || canAccessChatwootAsAgent(s),
  },
  {
    id: "postal",
    label: "Postal",
    Icon: Mail,
    iconColor: "text-pink-400",
    href: "https://postal.myperformance.pl",
    external: true,
    show: canAccessPostal,
  },
  {
    id: "users",
    label: "Użytkownicy",
    Icon: Users,
    iconColor: "text-indigo-400",
    href: "/admin/users",
    show: canAccessKeycloakAdmin,
  },
  {
    id: "config",
    label: "Konfiguracja",
    Icon: Settings,
    iconColor: "text-violet-400",
    href: "/admin/config",
    show: canAccessConfigHub,
  },
  {
    id: "pricelist",
    label: "Cennik",
    Icon: Tags,
    iconColor: "text-emerald-400",
    href: "/admin/pricelist",
    show: canAccessConfigHub,
  },
  {
    id: "email-admin",
    label: "Email i branding",
    Icon: Mail,
    iconColor: "text-indigo-400",
    href: "/admin/email",
    show: canAccessEmail,
  },
  {
    id: "infrastructure",
    label: "Infrastruktura",
    Icon: Server,
    iconColor: "text-indigo-400",
    href: "/admin/infrastructure",
    show: canAccessInfrastructure,
  },
  {
    id: "certs",
    label: "Certyfikaty",
    Icon: FileSignature,
    iconColor: "text-amber-400",
    href: "/admin/certificates",
    show: canManageCertificates,
  },
  {
    id: "keycloak",
    label: "Keycloak (IdP)",
    Icon: KeyRound,
    iconColor: "text-indigo-400",
    href: "/admin/keycloak",
    external: true,
    show: canAccessKeycloakAdmin,
  },
  {
    id: "security",
    label: "Bezpieczeństwo",
    Icon: Shield,
    iconColor: "text-rose-400",
    href: "/admin/security",
    show: canAccessKeycloakAdmin,
  },
];

function getInitials(label: string | null | undefined): string {
  if (!label) return "?";
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

interface UnifiedTopBarProps {
  /** Wymuś nazwę widoku zamiast detekcji po pathname (np. dla podstron). */
  viewName?: string;
  /** Tryb minimalny — bez menu Tools (panele bez accessów do dashboard endpointów). */
  minimal?: boolean;
  /** Custom max-width kontenera — domyślnie 7xl. */
  maxWidth?: "lg" | "xl" | "2xl" | "full";
}

/**
 * Uniwersalny TopBar — używany w dashboardzie i wszystkich panelach admin.
 *
 * Layout: [logo morph] [Tools menu] [search trigger] [theme] [bell]
 *         [user info] [account] [logout]
 */
export function UnifiedTopBar({
  viewName,
  minimal = false,
  maxWidth = "2xl",
}: UnifiedTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const { fullLogout } = useAuthRedirect();
  const platform = usePlatform();

  const detectedView = useMemo(
    () => viewName ?? viewNameForPath(pathname),
    [viewName, pathname],
  );

  const userLabel = useMemo(() => {
    const fn = session?.user?.firstName ?? "";
    const ln = session?.user?.lastName ?? "";
    const full = `${fn} ${ln}`.trim();
    if (full) return full;
    return session?.user?.name ?? session?.user?.email ?? "";
  }, [session]);
  const userEmail = session?.user?.email ?? "";

  const shortcutKey = platform === "other" ? "Ctrl+K" : "⌘K";

  // Tools menu — dropdown.
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toolsOpen) return;
    function onClick(e: MouseEvent) {
      if (toolsRef.current?.contains(e.target as Node)) return;
      setToolsOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setToolsOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [toolsOpen]);

  const visibleTools = useMemo(
    () => TOOL_CATALOG.filter((t) => t.show(session ?? null)),
    [session],
  );

  const triggerCmdK = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      }),
    );
  };

  const widthClass = {
    lg: "max-w-4xl",
    xl: "max-w-6xl",
    "2xl": "max-w-7xl",
    full: "max-w-full",
  }[maxWidth];

  const isAuthed = status === "authenticated";

  return (
    <header
      className="sticky top-0 z-[200] border-b border-[var(--border-subtle)] bg-[var(--bg-header)]/85 backdrop-blur-md"
      data-tour="unified-topbar"
    >
      <div
        className={`mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3 ${widthClass}`}
      >
        {/* Lewa strona: logo + Tools + search */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {/* Statyczne logo brandu + subtitle z nazwą widoku — bez animacji,
              gradient tekstu + uppercase tracking. */}
          <Link
            href="/dashboard"
            className="flex flex-col leading-tight flex-shrink-0 hover:opacity-90 transition-opacity"
            aria-label="MyPerformance — pulpit"
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
            <span className="text-[10px] sm:text-[11px] text-[var(--text-muted)] tracking-wide truncate max-w-[200px]">
              {detectedView}
            </span>
          </Link>

          {!minimal && isAuthed && visibleTools.length > 1 && (
            <div ref={toolsRef} className="relative">
              <button
                type="button"
                onClick={() => setToolsOpen((o) => !o)}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] transition"
                aria-label="Otwórz menu narzędzi"
                aria-expanded={toolsOpen}
                title="Wszystkie narzędzia"
                data-tour="tools-menu"
              >
                <Grid3x3 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Narzędzia</span>
              </button>
              {toolsOpen && (
                <div
                  role="menu"
                  className="absolute top-full left-0 mt-2 w-[min(92vw,560px)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl p-2 animate-fade-in"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                    {visibleTools.map((t) => {
                      const Icon = t.Icon;
                      const onClick = () => {
                        setToolsOpen(false);
                        if (t.external) {
                          window.open(t.href, "_blank", "noopener,noreferrer");
                        } else {
                          router.push(t.href);
                        }
                      };
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={onClick}
                          role="menuitem"
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left hover:bg-[var(--bg-surface)] transition-colors group"
                        >
                          <span className="w-8 h-8 rounded-lg bg-[var(--bg-surface)] flex items-center justify-center flex-shrink-0">
                            <Icon
                              className={`w-4 h-4 ${t.iconColor}`}
                              aria-hidden="true"
                            />
                          </span>
                          <span className="text-sm text-[var(--text-main)] truncate">
                            {t.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {!minimal && (
            <button
              type="button"
              data-tour="cmdk-button"
              className="hidden md:inline-flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] transition flex-shrink-0"
              aria-label="Wyszukaj globalnie"
              title={`${shortcutKey} — szybkie wyszukiwanie`}
              onClick={triggerCmdK}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Szukaj…</span>
              <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                {shortcutKey}
              </kbd>
            </button>
          )}
        </div>

        {/* Prawa strona: theme + bell + user + settings + logout */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {!minimal && (
            <span className="hidden sm:inline-flex">
              <ThemeToggle />
            </span>
          )}

          {isAuthed && (
            <span data-tour="bell">
              <NotificationBell />
            </span>
          )}

          {isAuthed && userLabel && (
            <div className="hidden md:flex items-center gap-2.5 px-2.5 py-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/40">
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
                <p className="text-xs font-medium text-[var(--text-main)] truncate max-w-[160px]">
                  {userLabel}
                </p>
                {userEmail && (
                  <p className="text-[10px] text-[var(--text-muted)] truncate max-w-[160px]">
                    {userEmail}
                  </p>
                )}
              </div>
            </div>
          )}

          {isAuthed && (
            <Link
              href="/account"
              aria-label="Zarządzaj kontem"
              data-tour="account-link"
              className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors"
            >
              <Settings className="w-5 h-5" aria-hidden="true" />
            </Link>
          )}

          {isAuthed && (
            <Button
              variant="ghost"
              size="md"
              leftIcon={<LogOut className="w-4 h-4" aria-hidden="true" />}
              onClick={() => void fullLogout()}
            >
              <span className="hidden sm:inline">Wyloguj</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
