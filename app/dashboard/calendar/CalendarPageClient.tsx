"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  Clock,
  GraduationCap,
  Plug,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import {
  Badge,
  Button,
  Card,
  PageShell,
} from "@/components/ui";
import { AccountProvider, useAccount } from "@/app/account/AccountProvider";
import { CalendarTab } from "@/app/account/components/CalendarTab";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";

interface CalendarPageClientProps {
  userLabel?: string;
  userEmail?: string;
}

export function CalendarPageClient(props: CalendarPageClientProps) {
  return (
    <Suspense fallback={null}>
      <AccountProvider>
        <CalendarPageBody {...props} />
      </AccountProvider>
    </Suspense>
  );
}

function CalendarPageBody({ userLabel, userEmail }: CalendarPageClientProps) {
  const { googleStatus, kadromierzStatus, moodleStatus, status } = useAccount();
  const { softLogout } = useAuthRedirect();

  useEffect(() => {
    if (status === "error") {
      void softLogout();
    }
  }, [status, softLogout]);

  const accountLoading = status === "loading" || status === "idle";
  const googleConnected = googleStatus?.connected === true;
  const kadromierzConnected = kadromierzStatus?.connected === true;
  const moodleHasRole = moodleStatus?.hasRole === true;
  const moodleConnected = moodleStatus?.connected === true;

  return (
    <PageShell
      maxWidth="xl"
      header={
        <AppHeader
          backHref="/dashboard"
          title="Kalendarz"
          userLabel={userLabel}
          userSubLabel={userEmail}
        />
      }
    >
      <section className="mb-6">
        <p className="text-sm text-[var(--text-muted)]">
          Twoje wydarzenia z Google Calendar oraz zmiany z Kadromierza w jednym
          widoku. Zsynchronizowane dane pochodzą bezpośrednio z podłączonych kont.
        </p>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <IntegrationCard
          icon={<Calendar className="w-6 h-6 text-blue-500" aria-hidden="true" />}
          iconBg="bg-blue-500/10"
          title="Google Calendar"
          description={
            googleStatus?.email
              ? `Połączono jako ${googleStatus.email}`
              : "Podłącz konto Google, aby synchronizować wydarzenia"
          }
          connected={googleConnected}
          loading={accountLoading}
          ctaHref="/account?tab=integrations"
          ctaLabel={googleConnected ? "Ustawienia" : "Połącz Google"}
        />
        <IntegrationCard
          icon={<Clock className="w-6 h-6 text-orange-500" aria-hidden="true" />}
          iconBg="bg-orange-500/10"
          title="Kadromierz"
          description={
            kadromierzConnected
              ? "Zmiany są wczytywane w widoku kalendarza"
              : "Dodaj klucz API Kadromierza, aby widzieć swój grafik"
          }
          connected={kadromierzConnected}
          loading={accountLoading}
          ctaHref="/account?tab=integrations"
          ctaLabel={kadromierzConnected ? "Ustawienia" : "Skonfiguruj"}
        />
        {moodleHasRole && (
          <IntegrationCard
            icon={<GraduationCap className="w-6 h-6 text-amber-500" aria-hidden="true" />}
            iconBg="bg-amber-500/10"
            title="Akademia — kalendarz"
            description={
              moodleConnected
                ? "Terminy szkoleń, zadań i wydarzeń kursów z Moodle"
                : moodleStatus?.reason === "not_provisioned"
                  ? "Zaloguj się raz do Akademii, aby zainicjalizować konto"
                  : "Akademia niedostępna — sprawdź połączenie sieciowe"
            }
            connected={moodleConnected}
            loading={accountLoading}
            ctaHref="https://moodle.myperformance.pl/"
            ctaLabel={moodleConnected ? "Otwórz Akademię" : "Zaloguj się"}
          />
        )}
      </section>

      {googleConnected ? (
        <CalendarTab />
      ) : (
        <Card padding="lg" className="text-center">
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <Calendar className="w-7 h-7 text-blue-500" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-main)]">
                Podłącz Google, aby zobaczyć wydarzenia
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)] max-w-md mx-auto">
                Po podłączeniu konta Google zobaczysz tutaj wszystkie wydarzenia
                oraz zmiany Kadromierza (jeśli jest skonfigurowany).
              </p>
            </div>
            <Link href="/account?tab=integrations">
              <Button leftIcon={<Plug className="w-4 h-4" aria-hidden="true" />}>
                Skonfiguruj integracje
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </PageShell>
  );
}

function IntegrationCard({
  icon,
  iconBg,
  title,
  description,
  connected,
  loading,
  ctaHref,
  ctaLabel,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  connected: boolean;
  loading: boolean;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <Card padding="md" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[var(--text-main)]">
              {title}
            </h3>
            {!loading && connected && (
              <Badge tone="success">
                <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden="true" />
                Połączono
              </Badge>
            )}
            {!loading && !connected && <Badge tone="neutral">Niepołączono</Badge>}
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-1">{description}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Link href={ctaHref}>
          <Button
            size="sm"
            variant={connected ? "secondary" : "primary"}
            leftIcon={<Plug className="w-4 h-4" aria-hidden="true" />}
          >
            {ctaLabel}
          </Button>
        </Link>
      </div>
    </Card>
  );
}
