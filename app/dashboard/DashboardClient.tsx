"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  BookMarked,
  Briefcase,
  Calendar,
  Clock,
  Database,
  ExternalLink,
  FileSignature,
  GraduationCap,
  KeyRound,
  Library,
  Mail,
  Server,
  MessageSquare,
  Plug,
  School,
  Shield,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
} from "lucide-react";

import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { AppFooter } from "@/components/AppFooter";
import { AppHeader } from "@/components/AppHeader";
import { Card, OnboardingCard, PageShell } from "@/components/ui";
import { AccountProvider, useAccount } from "@/app/account/AccountProvider";
import { KadromierzWorkWidget } from "./components/KadromierzWorkWidget";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import {
  canAccessAdminPanel,
  canAccessCalendar,
  canAccessChatwootAsAdmin,
  canAccessChatwootAsAgent,
  canAccessDirectus,
  canAccessDocumensoAsAdmin,
  canAccessDocumensoAsHandler,
  canAccessDocumensoAsUser,
  canAccessEmail,
  canAccessInfrastructure,
  canAccessKadromierz,
  canAccessKeycloakAdmin,
  canAccessKnowledgeBase,
  canAccessMoodleAsAdmin,
  canAccessMoodleAsStudent,
  canAccessMoodleAsTeacher,
  canAccessPanel,
  canAccessPostal,
  canManageCertificates,
} from "@/lib/admin-auth";
import { cn } from "@/lib/utils";

interface DashboardClientProps {
  userLabel?: string;
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

function DashboardBody({ userLabel, email }: DashboardClientProps) {
  const { data: session } = useSession();
  const { softLogout } = useAuthRedirect();

  useEffect(() => {
    if (session?.error === "RefreshTokenExpired") void softLogout();
  }, [session?.error, softLogout]);


  return (
    <PageShell
      maxWidth="xl"
      header={<AppHeader userLabel={userLabel} userSubLabel={email} />}
    >
      <TileGridWithFooter />
    </PageShell>
  );
}

function TileGridWithFooter() {
  return (
    <>
      <TileGrid />
      <AppFooter />
    </>
  );
}

function TileGrid() {
  const { googleStatus, kadromierzStatus, status } = useAccount();
  const { data: session } = useSession();
  const accountLoading = status === "loading" || status === "idle";
  const googleConnected = googleStatus?.connected === true;
  const kadromierzConnected = kadromierzStatus?.connected === true;

  const showCalendar = canAccessCalendar(session);
  const showKadromierz = canAccessKadromierz(session);
  const showDirectus = canAccessDirectus(session);
  const showDocumensoUser = canAccessDocumensoAsUser(session);
  const showDocumensoHandler = canAccessDocumensoAsHandler(session);
  const showDocumensoAdmin = canAccessDocumensoAsAdmin(session);
  const showDocumenso =
    showDocumensoUser || showDocumensoHandler || showDocumensoAdmin;

  const showMoodleStudent = canAccessMoodleAsStudent(session);
  const showMoodleTeacher = canAccessMoodleAsTeacher(session);
  const showMoodleAdmin = canAccessMoodleAsAdmin(session);
  const showMoodle = showMoodleStudent || showMoodleTeacher || showMoodleAdmin;

  const showKnowledge = canAccessKnowledgeBase(session);
  const showChatwootAgent = canAccessChatwootAsAgent(session);
  const showChatwootAdmin = canAccessChatwootAsAdmin(session);
  const showChatwoot = showChatwootAgent || showChatwootAdmin;
  const showPostal = canAccessPostal(session);
  const showKeycloak = canAccessKeycloakAdmin(session);
  const showUsersAdmin = canAccessKeycloakAdmin(session);
  const showEmailAdmin = canAccessEmail(session);
  const showInfrastructureAdmin = canAccessInfrastructure(session);
  const showCerts = canManageCertificates(session);
  const showSprzedawca = canAccessPanel(session, "sprzedawca");
  const showSerwisant = canAccessPanel(session, "serwisant");
  const showKierowca = canAccessPanel(session, "kierowca");

  const anyVisible =
    showCalendar || showKadromierz || showDirectus ||
    showDocumenso || showMoodle || showKnowledge ||
    showChatwoot || showPostal || showKeycloak ||
    showUsersAdmin || showEmailAdmin || showInfrastructureAdmin ||
    showCerts ||
    showSprzedawca || showSerwisant || showKierowca;

  return (
    <div className="space-y-4">
      <AnnouncementBanner />
      <OnboardingCard
        storageKey="dashboard-welcome"
        title="Witaj w MyPerformance"
      >
        Tutaj zobaczysz tylko aplikacje, do których masz dostęp. Klikaj kafelki
        żeby uruchomić apkę z auto-loginem przez SSO. Wciśnij{" "}
        <kbd className="px-1 py-0.5 text-[10px] rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          ⌘K
        </kbd>{" "}
        żeby otworzyć paletę poleceń, lub odwiedź{" "}
        <Link href="/account?tab=preferences" className="underline">
          Preferencje
        </Link>{" "}
        i uruchom interaktywny przewodnik.
      </OnboardingCard>
      {showKadromierz && kadromierzConnected && <KadromierzWorkWidget />}
      <div
        data-tour="tile-grid"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {showCalendar && (
          <Tile
            icon={<Calendar className="w-7 h-7 text-blue-500" aria-hidden="true" />}
            iconBg="bg-blue-500/10"
            title="Kalendarz"
            tourId="calendar"
            description={
              googleConnected
                ? "Twoje wydarzenia, Google Calendar, Kadromierz"
                : "Konfiguracja Google / Kadromierz i wydarzenia"
            }
            onClick={() => {
              window.location.href = "/dashboard/calendar";
            }}
          />
        )}

        {showKadromierz && !kadromierzConnected && (
          <Tile
            icon={<Clock className="w-7 h-7 text-orange-500" aria-hidden="true" />}
            iconBg="bg-orange-500/10"
            title="Kadromierz"
            tourId="kadromierz"
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

        {showSprzedawca && (
          <ExternalTile
            icon={<Briefcase className="w-7 h-7 text-sky-500" aria-hidden="true" />}
            iconBg="bg-sky-500/10"
            title="Panel Sprzedawcy"
            tourId="panel-sprzedawca"
            description="Oferty, zamówienia, klienci"
            href="/panel/sprzedawca/launch"
          />
        )}
        {showSerwisant && (
          <ExternalTile
            icon={<Wrench className="w-7 h-7 text-rose-500" aria-hidden="true" />}
            iconBg="bg-rose-500/10"
            title="Panel Serwisanta"
            tourId="panel-serwisant"
            description="Zgłoszenia serwisowe i naprawy"
            href="/panel/serwisant/launch"
          />
        )}
        {showKierowca && (
          <ExternalTile
            icon={<Truck className="w-7 h-7 text-lime-500" aria-hidden="true" />}
            iconBg="bg-lime-500/10"
            title="Panel Kierowcy"
            tourId="panel-kierowca"
            description="Trasy, dostawy, pojazdy"
            href="/panel/kierowca/launch"
          />
        )}

        {showCerts && (
          <Tile
            icon={
              <FileSignature className="w-7 h-7 text-amber-500" aria-hidden="true" />
            }
            iconBg="bg-amber-500/10"
            title="Certyfikaty klienckie"
            tourId="certs"
            description="Zarządzanie certyfikatami dostępu do paneli"
            onClick={() => {
              window.location.href = "/admin/certificates";
            }}
          />
        )}

        {showDirectus && (
          <ExternalTile
            icon={
              <Database className="w-7 h-7 text-emerald-500" aria-hidden="true" />
            }
            iconBg="bg-emerald-500/10"
            title="Directus"
            tourId="directus"
            description="Zarządzanie treścią i danymi aplikacji (SSO)"
            href="/api/directus/launch"
          />
        )}

        {showDocumenso && (
          <ExternalTile
            icon={<FileSignature className="w-7 h-7 text-purple-500" aria-hidden="true" />}
            iconBg="bg-purple-500/10"
            title="Dokumenty"
            tourId="documenso"
            description={
              showDocumensoAdmin
                ? "Pełna konsola Documenso — szablony, webhooki, użytkownicy"
                : showDocumensoHandler
                  ? "Obieg dokumentów organizacji — wysyłka, status, podpisy"
                  : "Twoje dokumenty do podpisu i już podpisane"
            }
            href="/api/documenso/sso"
          />
        )}

        {showChatwoot && (
          <ExternalTile
            icon={<MessageSquare className="w-7 h-7 text-sky-500" aria-hidden="true" />}
            iconBg="bg-sky-500/10"
            title="Chatwoot"
            tourId="chatwoot"
            description={
              showChatwootAdmin
                ? "Konfiguracja platformy, użytkownicy, webhooki"
                : "Rozmowy z klientami — omnichannel inbox"
            }
            href="/api/chatwoot/sso"
          />
        )}

        {showPostal && (
          <ExternalTile
            icon={<Mail className="w-7 h-7 text-pink-500" aria-hidden="true" />}
            iconBg="bg-pink-500/10"
            title="Postal"
            tourId="postal"
            description="Serwer pocztowy — transakcyjne i newslettery"
            href="https://postal.myperformance.pl"
          />
        )}

        {showMoodle && (
          <ExternalTile
            icon={
              showMoodleAdmin ? (
                <GraduationCap className="w-7 h-7 text-orange-500" aria-hidden="true" />
              ) : showMoodleTeacher ? (
                <School className="w-7 h-7 text-amber-500" aria-hidden="true" />
              ) : (
                <Library className="w-7 h-7 text-amber-400" aria-hidden="true" />
              )
            }
            iconBg="bg-amber-500/10"
            title="MyPerformance — Akademia"
            tourId="moodle"
            description={
              showMoodleAdmin
                ? "Konsola administracyjna — konfiguracja, użytkownicy, pluginy"
                : showMoodleTeacher
                  ? "Twoje kursy do prowadzenia, ocenianie, raporty"
                  : "Twoje kursy i szkolenia"
            }
            href="/api/moodle/launch"
          />
        )}

        {showKnowledge && (
          <ExternalTile
            icon={<BookMarked className="w-7 h-7 text-teal-400" aria-hidden="true" />}
            iconBg="bg-teal-500/10"
            title="Baza wiedzy"
            tourId="knowledge"
            description="Procedury, zasady, how-to — wewnętrzna wiki zespołu (Outline)"
            href="/api/outline/launch"
          />
        )}

        {showUsersAdmin && (
          <Tile
            icon={<Users className="w-7 h-7 text-indigo-500" aria-hidden="true" />}
            iconBg="bg-indigo-500/10"
            title="Użytkownicy"
            tourId="users"
            description="Zarządzanie użytkownikami i precyzyjne przypisywanie ról per panel (Keycloak SoT)"
            onClick={() => {
              window.location.href = "/admin/users";
            }}
          />
        )}

        {showEmailAdmin && (
          <Tile
            icon={<Mail className="w-7 h-7 text-indigo-500" aria-hidden="true" />}
            iconBg="bg-indigo-500/10"
            title="Email i branding"
            tourId="email"
            description="Centralny panel: branding, szablony Keycloak, Postal (serwery/skrzynki/domeny), test send"
            onClick={() => {
              window.location.href = "/admin/email";
            }}
          />
        )}

        {showInfrastructureAdmin && (
          <Tile
            icon={<Server className="w-7 h-7 text-indigo-500" aria-hidden="true" />}
            iconBg="bg-indigo-500/10"
            title="Infrastruktura serwera"
            tourId="infrastructure"
            description="VPS, DNS, snapshoty, backupy, monitoring zasobów (CPU/RAM/Disk), alerty bezpieczeństwa, blokady IP, Wazuh SIEM"
            onClick={() => {
              window.location.href = "/admin/infrastructure";
            }}
          />
        )}


        {showKeycloak && (
          <ExternalTile
            icon={<KeyRound className="w-7 h-7 text-indigo-500" aria-hidden="true" />}
            iconBg="bg-indigo-500/10"
            title="Keycloak (konsola IdP)"
            tourId="keycloak"
            description="Natywna konsola administracyjna Keycloak — realms, klienci, IdP, polityki"
            href="/admin/keycloak"
          />
        )}

        {!anyVisible && (
          <Card padding="lg" className="col-span-full text-center">
            <p className="text-sm text-[var(--text-muted)]">
              Nie masz jeszcze dostępu do żadnej sekcji. Skontaktuj się z administratorem,
              aby uzyskać uprawnienia.
            </p>
          </Card>
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
  sameTab,
  tourId,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  href?: string;
  disabled?: boolean;
  sameTab?: boolean;
  tourId?: string;
}) {
  const handleClick = () => {
    if (disabled || !href) return;
    if (sameTab) {
      window.location.href = href;
    } else {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };
  return (
    <Tile
      icon={icon}
      iconBg={iconBg}
      title={title}
      description={description}
      disabled={disabled}
      tourId={tourId}
      footer={
        !disabled && href ? (
          <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)]">
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            {sameTab ? "Otwórz" : "Otwórz w nowej karcie"}
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
  tourId,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  disabled?: boolean;
  footer?: React.ReactNode;
  onClick: () => void;
  tourId?: string;
}) {
  return (
    <div
      data-tour-tile={tourId}
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
