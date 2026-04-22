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
  MessageSquare,
  Plug,
  School,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { Card, PageShell } from "@/components/ui";
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
  canAccessKadromierz,
  canAccessKeycloakAdmin,
  canAccessKnowledgeBase,
  canAccessMoodleAsAdmin,
  canAccessMoodleAsStudent,
  canAccessMoodleAsTeacher,
  canAccessPanel,
  canAccessPostal,
  canAccessStepCa,
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
      <TileGrid />
    </PageShell>
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
  const showMoodleStudent = canAccessMoodleAsStudent(session);
  const showMoodleTeacher = canAccessMoodleAsTeacher(session);
  const showMoodleAdmin = canAccessMoodleAsAdmin(session);
  const showKnowledge = canAccessKnowledgeBase(session);
  const showChatwootAgent = canAccessChatwootAsAgent(session);
  const showChatwootAdmin = canAccessChatwootAsAdmin(session);
  const showPostal = canAccessPostal(session);
  const showKeycloak = canAccessKeycloakAdmin(session);
  const showStepCa = canAccessStepCa(session);
  const showCerts = canManageCertificates(session);
  const showUsers = canAccessAdminPanel(session);
  const showSprzedawca = canAccessPanel(session, "sprzedawca");
  const showSerwisant = canAccessPanel(session, "serwisant");
  const showKierowca = canAccessPanel(session, "kierowca");

  const anyVisible =
    showCalendar || showKadromierz || showDirectus ||
    showDocumensoUser || showDocumensoHandler || showDocumensoAdmin ||
    showMoodleStudent || showMoodleTeacher || showMoodleAdmin ||
    showKnowledge ||
    showChatwootAgent || showChatwootAdmin || showPostal || showKeycloak ||
    showStepCa || showCerts || showUsers || showSprzedawca ||
    showSerwisant || showKierowca;

  return (
    <div className="space-y-4">
      {showKadromierz && kadromierzConnected && <KadromierzWorkWidget />}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {showCalendar && (
          <Tile
            icon={<Calendar className="w-7 h-7 text-blue-500" aria-hidden="true" />}
            iconBg="bg-blue-500/10"
            title="Kalendarz"
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
            description="Oferty, zamówienia, klienci"
            href="https://panelsprzedawcy.myperformance.pl"
          />
        )}
        {showSerwisant && (
          <ExternalTile
            icon={<Wrench className="w-7 h-7 text-rose-500" aria-hidden="true" />}
            iconBg="bg-rose-500/10"
            title="Panel Serwisanta"
            description="Zgłoszenia serwisowe i naprawy"
            href="https://panelserwisanta.myperformance.pl"
          />
        )}
        {showKierowca && (
          <ExternalTile
            icon={<Truck className="w-7 h-7 text-lime-500" aria-hidden="true" />}
            iconBg="bg-lime-500/10"
            title="Panel Kierowcy"
            description="Trasy, dostawy, pojazdy"
            href="https://panelkierowcy.myperformance.pl"
          />
        )}

        {showCerts && (
          <Tile
            icon={
              <FileSignature className="w-7 h-7 text-amber-500" aria-hidden="true" />
            }
            iconBg="bg-amber-500/10"
            title="Certyfikaty klienckie"
            description="Zarządzanie certyfikatami dostępu do paneli"
            onClick={() => {
              window.location.href = "/admin/certificates";
            }}
          />
        )}

        {showUsers && (
          <Tile
            icon={<Users className="w-7 h-7 text-violet-500" aria-hidden="true" />}
            iconBg="bg-violet-500/10"
            title="Użytkownicy"
            description="Zarządzanie kontami, rolami i uprawnieniami"
            onClick={() => {
              window.location.href = "/admin/users";
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
            description="Zarządzanie treścią i danymi aplikacji (SSO)"
            href="https://cms.myperformance.pl"
          />
        )}

        {showDocumensoUser && (
          <ExternalTile
            icon={<FileSignature className="w-7 h-7 text-purple-500" aria-hidden="true" />}
            iconBg="bg-purple-500/10"
            title="Documenso — pracownik"
            description="Twoje dokumenty do podpisu i już podpisane (Documenso)"
            href="/api/documenso/sso?role=user"
          />
        )}

        {showDocumensoHandler && (
          <Tile
            icon={<FileSignature className="w-7 h-7 text-violet-400" aria-hidden="true" />}
            iconBg="bg-violet-500/10"
            title="Obsługa dokumentów"
            description="Wszystkie dokumenty organizacji w obiegu — status, odbiorcy, wysyłka (księgowa)"
            onClick={() => {
              window.location.href = "/dashboard/documents-handler";
            }}
          />
        )}

        {showDocumensoAdmin && (
          <ExternalTile
            icon={<FileSignature className="w-7 h-7 text-fuchsia-500" aria-hidden="true" />}
            iconBg="bg-fuchsia-500/10"
            title="Documenso — administrator"
            description="Szablony, webhooki, użytkownicy (SSO)"
            href="/api/documenso/sso?role=admin"
          />
        )}

        {showChatwootAgent && (
          <ExternalTile
            icon={<MessageSquare className="w-7 h-7 text-sky-500" aria-hidden="true" />}
            iconBg="bg-sky-500/10"
            title="Chatwoot — agent"
            description="Obsługa rozmów z klientami (SSO przez Keycloak)"
            href="/api/chatwoot/sso?role=agent"
          />
        )}

        {showChatwootAdmin && (
          <ExternalTile
            icon={<MessageSquare className="w-7 h-7 text-cyan-500" aria-hidden="true" />}
            iconBg="bg-cyan-500/10"
            title="Chatwoot - administrator"
            description="Konfiguracja, użytkownicy, webhooki (SSO)"
            href="/api/chatwoot/sso?role=admin"
          />
        )}

        {showPostal && (
          <ExternalTile
            icon={<Mail className="w-7 h-7 text-pink-500" aria-hidden="true" />}
            iconBg="bg-pink-500/10"
            title="Postal"
            description="Serwer pocztowy — transakcyjne i newslettery"
            href="https://postal.myperformance.pl"
          />
        )}

        {showMoodleStudent && (
          <ExternalTile
            icon={<Library className="w-7 h-7 text-amber-400" aria-hidden="true" />}
            iconBg="bg-amber-500/10"
            title="Akademia — uczeń"
            description="Twoje kursy i szkolenia przypisane przez prowadzącego (Moodle)"
            href="https://moodle.myperformance.pl/my/"
          />
        )}

        {showMoodleTeacher && (
          <ExternalTile
            icon={<School className="w-7 h-7 text-amber-500" aria-hidden="true" />}
            iconBg="bg-amber-500/10"
            title="Akademia — nauczyciel"
            description="Tworzenie kursów, ocenianie, raporty uczniów (Moodle)"
            href="https://moodle.myperformance.pl/course/"
          />
        )}

        {showMoodleAdmin && (
          <ExternalTile
            icon={<GraduationCap className="w-7 h-7 text-orange-500" aria-hidden="true" />}
            iconBg="bg-orange-500/10"
            title="Akademia — administrator"
            description="Konfiguracja instancji, użytkownicy, pluginy, role (Moodle)"
            href="https://moodle.myperformance.pl/admin/"
          />
        )}

        {showKnowledge && (
          <ExternalTile
            icon={<BookMarked className="w-7 h-7 text-teal-400" aria-hidden="true" />}
            iconBg="bg-teal-500/10"
            title="Baza wiedzy"
            description="Procedury, zasady, how-to — wewnętrzna wiki zespołu (Outline)"
            href="https://knowledge.myperformance.pl"
          />
        )}

        {showKeycloak && (
          <ExternalTile
            icon={<KeyRound className="w-7 h-7 text-indigo-500" aria-hidden="true" />}
            iconBg="bg-indigo-500/10"
            title="Keycloak"
            description="Konsola administracyjna Keycloak (SSO)"
            href="https://auth.myperformance.pl/admin/master/console/"
          />
        )}

        {showStepCa && (
          <Tile
            icon={<ShieldCheck className="w-7 h-7 text-teal-500" aria-hidden="true" />}
            iconBg="bg-teal-500/10"
            title="Step CA"
            description="Infrastruktura PKI — prowizjonerzy, root cert, self-service"
            onClick={() => {
              window.location.href = "/dashboard/step-ca";
            }}
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
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  href?: string;
  disabled?: boolean;
  sameTab?: boolean;
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
