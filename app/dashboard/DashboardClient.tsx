"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Clock,
  Database,
  ExternalLink,
  FileSignature,
  Folder,
  LayoutGrid,
  Mail,
  MessageSquare,
  Plug,
  Truck,
  Wrench,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { Button, Card, PageShell } from "@/components/ui";
import { WelcomeAnimation } from "@/components/WelcomeAnimation";
import { AccountProvider, useAccount } from "@/app/account/AccountProvider";
import { CalendarTab } from "@/app/account/components/CalendarTab";
import { KadromierzWorkWidget } from "./components/KadromierzWorkWidget";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import { canAccessDirectus, canAccessPanel, isSuperAdmin } from "@/lib/admin-auth";
import { cn } from "@/lib/utils";

const WELCOME_KEY = "welcome-pending";

type DashboardView = "home" | "calendar";
type WelcomeStage = "resolving" | "playing" | "revealing" | "done";

interface DashboardClientProps {
  firstName: string;
  lastName: string;
  email?: string;
}

export function DashboardClient(props: DashboardClientProps) {
  return (
    <Suspense fallback={null}>
      <AccountProvider>
        <DashboardBody {...props} />
      </AccountProvider>
    </Suspense>
  );
}

function DashboardBody({ firstName, lastName, email }: DashboardClientProps) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const userLabel = fullName || email || "";
  const headingLabel = fullName || email || "Użytkowniku";

  const { data: session } = useSession();
  const { softLogout } = useAuthRedirect();

  const [stage, setStage] = useState<WelcomeStage>("resolving");
  const [view, setView] = useState<DashboardView>("home");
  const consumedRef = useRef(false);

  // Atomically consume the welcome-pending flag once per mount.
  // sessionStorage removal is synchronous so StrictMode's double-mount cannot replay.
  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;
    if (typeof window === "undefined") {
      setStage("done");
      return;
    }
    const pending =
      window.sessionStorage.getItem(WELCOME_KEY) === "1" && !!firstName;
    if (pending) window.sessionStorage.removeItem(WELCOME_KEY);
    setStage(pending ? "playing" : "done");
  }, [firstName]);

  // Refresh-token failures should bounce the user out cleanly, not cascade via 401s.
  useEffect(() => {
    if (session?.error === "RefreshTokenExpired") void softLogout();
  }, [session?.error, softLogout]);

  const handleRevealPanel = useCallback(() => setStage("revealing"), []);
  const handleAnimationDone = useCallback(() => setStage("done"), []);

  const panelVisible = stage === "done" || stage === "revealing";

  return (
    <>
      <div
        aria-hidden={!panelVisible}
        style={{
          opacity: panelVisible ? 1 : 0,
          transition: "opacity 700ms cubic-bezier(0.65, 0, 0.35, 1)",
          pointerEvents: panelVisible ? "auto" : "none",
          willChange: panelVisible ? "auto" : "opacity",
        }}
      >
        <PageShell
          maxWidth="xl"
          header={<AppHeader userLabel={userLabel} userSubLabel={email} />}
        >
          <section className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-[var(--text-main)]">
              {headingLabel}
            </h1>
          </section>

          <div className="flex gap-6 items-start">
            <Sidebar view={view} onSelect={setView} />
            <main className="flex-1 min-w-0">
              <ViewSwitcher
                view={view}
                onOpenCalendar={() => setView("calendar")}
              />
            </main>
          </div>
        </PageShell>
      </div>

      {(stage === "playing" || stage === "revealing") && (
        <WelcomeAnimation
          firstName={firstName}
          lastName={lastName}
          onRevealPanel={handleRevealPanel}
          onDone={handleAnimationDone}
        />
      )}
    </>
  );
}

function Sidebar({
  view,
  onSelect,
}: {
  view: DashboardView;
  onSelect: (next: DashboardView) => void;
}) {
  const expanded = view !== "home";

  const items: Array<{
    id: DashboardView;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "home",
      label: "Dashboard",
      icon: <LayoutGrid className="w-5 h-5" aria-hidden="true" />,
    },
    {
      id: "calendar",
      label: "Kalendarz",
      icon: <Calendar className="w-5 h-5" aria-hidden="true" />,
    },
  ];

  return (
    <aside
      aria-label="Nawigacja sekcji"
      className={cn(
        "overflow-hidden transition-[max-width,opacity,margin] duration-500 ease-[cubic-bezier(0.65,0,0.35,1)] flex-shrink-0",
        expanded
          ? "max-w-[240px] opacity-100"
          : "max-w-0 opacity-0 pointer-events-none",
      )}
      aria-hidden={!expanded}
    >
      <nav className="w-[220px]">
        <Card padding="sm">
          <ul className="space-y-1">
            {items.map((item) => {
              const active = item.id === view;
              const isHome = item.id === "home";
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left",
                      active
                        ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)]",
                    )}
                  >
                    {isHome ? (
                      <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      item.icon
                    )}
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </nav>
    </aside>
  );
}

function ViewSwitcher({
  view,
  onOpenCalendar,
}: {
  view: DashboardView;
  onOpenCalendar: () => void;
}) {
  return (
    <div key={view} className="animate-tab-in">
      {view === "home" ? (
        <TileGrid onOpenCalendar={onOpenCalendar} />
      ) : (
        <CalendarView />
      )}
    </div>
  );
}

function TileGrid({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  const { googleStatus, kadromierzStatus, status } = useAccount();
  const { data: session } = useSession();
  const accountLoading = status === "loading" || status === "idle";
  const googleConnected = googleStatus?.connected === true;
  const kadromierzConnected = kadromierzStatus?.connected === true;
  const directusVisible = canAccessDirectus(session);

  return (
    <div className="space-y-4">
      {kadromierzConnected && <KadromierzWorkWidget />}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Tile
          icon={<Calendar className="w-7 h-7 text-blue-500" aria-hidden="true" />}
          iconBg="bg-blue-500/10"
          title="Kalendarz"
          description={
            googleConnected
              ? "Twoje wydarzenia i Google Calendar"
              : "Wymaga integracji z Google"
          }
          disabled={accountLoading || !googleConnected}
          footer={
            !accountLoading && !googleConnected ? (
              <Link
                href="/account?tab=integrations"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <Plug className="w-3.5 h-3.5" aria-hidden="true" />
                Skonfiguruj Google
              </Link>
            ) : null
          }
          onClick={onOpenCalendar}
        />
        {directusVisible && (
          <ExternalTile
            icon={
              <Database className="w-7 h-7 text-emerald-500" aria-hidden="true" />
            }
            iconBg="bg-emerald-500/10"
            title="Directus"
            description="Zarządzanie treścią i danymi aplikacji (SSO)"
            href="https://cms.myperformance.pl"
          />
        )}
        <Tile
          icon={
            <FileSignature className="w-7 h-7 text-purple-500" aria-hidden="true" />
          }
          iconBg="bg-purple-500/10"
          title="Moje dokumenty"
          description="Dokumenty do podpisu i podpisane (Docuseal)"
          onClick={() => {
            window.location.href = "/dashboard/moje-dokumenty";
          }}
        />
        {isSuperAdmin(session) && (
          <Tile
            icon={
              <FileSignature className="w-7 h-7 text-amber-500" aria-hidden="true" />
            }
            iconBg="bg-amber-500/10"
            title="Certyfikaty klienckie"
            description="Zarządzanie certyfikatami dostępu do paneli (admin)"
            onClick={() => {
              window.location.href = "/admin/certificates";
            }}
          />
        )}
        {canAccessPanel(session, "sprzedawca") && (
          <ExternalTile
            icon={<Briefcase className="w-7 h-7 text-sky-500" aria-hidden="true" />}
            iconBg="bg-sky-500/10"
            title="Panel Sprzedawcy"
            description="Oferty, zamówienia, klienci"
            href="https://panelsprzedawcy.myperformance.pl"
          />
        )}
        {canAccessPanel(session, "serwisant") && (
          <ExternalTile
            icon={<Wrench className="w-7 h-7 text-rose-500" aria-hidden="true" />}
            iconBg="bg-rose-500/10"
            title="Panel Serwisanta"
            description="Zgłoszenia serwisowe i naprawy"
            href="https://panelserwisanta.myperformance.pl"
          />
        )}
        {canAccessPanel(session, "kierowca") && (
          <ExternalTile
            icon={<Truck className="w-7 h-7 text-lime-500" aria-hidden="true" />}
            iconBg="bg-lime-500/10"
            title="Panel Kierowcy"
            description="Trasy, dostawy, pojazdy"
            href="https://panelkierowcy.myperformance.pl"
          />
        )}
        {canAccessPanel(session, "dokumenty") && (
          <ExternalTile
            icon={<Folder className="w-7 h-7 text-indigo-500" aria-hidden="true" />}
            iconBg="bg-indigo-500/10"
            title="Obieg dokumentów"
            description="Workflow dokumentów firmowych (Docuseal)"
            href="https://dokumenty.myperformance.pl"
          />
        )}
        {isSuperAdmin(session) && (
          <ExternalTile
            icon={<FileSignature className="w-7 h-7 text-fuchsia-500" aria-hidden="true" />}
            iconBg="bg-fuchsia-500/10"
            title="Docuseal"
            description="Elektroniczne podpisy i szablony dokumentów"
            href="https://sign.myperformance.pl"
          />
        )}
        {isSuperAdmin(session) && (
          <ExternalTile
            icon={<MessageSquare className="w-7 h-7 text-cyan-500" aria-hidden="true" />}
            iconBg="bg-cyan-500/10"
            title="Chatwoot"
            description="Obsługa klienta: chat, tickets, inbox"
            href="https://chat.myperformance.pl"
          />
        )}
        {isSuperAdmin(session) && (
          <ExternalTile
            icon={<Mail className="w-7 h-7 text-pink-500" aria-hidden="true" />}
            iconBg="bg-pink-500/10"
            title="Listmonk"
            description="Transakcyjne i marketingowe e-maile"
            href="https://mail.myperformance.pl"
          />
        )}
        {!kadromierzConnected && (
          <Tile
            icon={<Clock className="w-7 h-7 text-orange-500" aria-hidden="true" />}
            iconBg="bg-orange-500/10"
            title="Kadromierz"
            description="Grafik pracy i ewidencja czasu"
            disabled={accountLoading}
            footer={
              !accountLoading ? (
                <Link
                  href="/account?tab=integrations"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Plug className="w-3.5 h-3.5" aria-hidden="true" />
                  Skonfiguruj Kadromierz
                </Link>
              ) : null
            }
            onClick={() => {
              window.location.href = "/account?tab=integrations";
            }}
          />
        )}
      </div>
    </div>
  );
}

function ExternalTile({
  icon,
  iconBg,
  title,
  description,
  href,
  disabled,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  href?: string;
  disabled?: boolean;
}) {
  const handleClick = () => {
    if (disabled || !href) return;
    window.open(href, "_blank", "noopener,noreferrer");
  };
  return (
    <Tile
      icon={icon}
      iconBg={iconBg}
      title={title}
      description={description}
      disabled={disabled}
      footer={
        !disabled && href ? (
          <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)]">
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            Otwórz w nowej karcie
          </span>
        ) : disabled ? (
          <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
            Wkrótce
          </span>
        ) : null
      }
      onClick={handleClick}
    />
  );
}

function Tile({
  icon,
  iconBg,
  title,
  description,
  disabled,
  footer,
  onClick,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  disabled?: boolean;
  footer?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 transition-all",
        disabled
          ? "opacity-60"
          : "hover:border-[var(--accent)]/40 hover:shadow-lg hover:-translate-y-0.5",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "absolute inset-0 rounded-2xl",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
        aria-label={title}
      />
      <div
        className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
          iconBg,
        )}
      >
        {icon}
      </div>
      <h3 className="text-base font-semibold text-[var(--text-main)]">
        {title}
      </h3>
      <p className="text-sm text-[var(--text-muted)] mt-1">{description}</p>
      {footer && <div className="relative">{footer}</div>}
    </div>
  );
}

function CalendarView() {
  const { googleStatus, status } = useAccount();
  const accountLoading = status === "loading" || status === "idle";
  const googleConnected = googleStatus?.connected === true;

  if (accountLoading) {
    return (
      <Card
        padding="lg"
        className="min-h-[360px] flex items-center justify-center"
      >
        <p className="text-sm text-[var(--text-muted)]">Ładowanie kalendarza…</p>
      </Card>
    );
  }

  if (!googleConnected) {
    return (
      <Card padding="lg" className="text-center">
        <div className="flex flex-col items-center gap-4 py-8 opacity-80">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
            <Calendar className="w-7 h-7 text-blue-500" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-main)]">
              Kalendarz jest nieaktywny
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)] max-w-md mx-auto">
              Aby korzystać z kalendarza, podłącz konto Google w ustawieniach
              integracji.
            </p>
          </div>
          <Link href="/account?tab=integrations" className="inline-block">
            <Button leftIcon={<Plug className="w-4 h-4" aria-hidden="true" />}>
              Skonfiguruj integrację Google
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  return <CalendarTab />;
}
