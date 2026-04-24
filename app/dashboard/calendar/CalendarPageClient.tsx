"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  Clock,
  GraduationCap,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import {
  Badge,
  Button,
  Card,
} from "@/components/ui";
import { PageShell } from "@/components/ui";
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
  const moodleConnected = moodleHasRole;

  const integrationCount =
    (googleConnected ? 1 : 0) +
    (kadromierzConnected ? 1 : 0) +
    (moodleConnected ? 1 : 0);

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
          {integrationCount > 0
            ? "Twoje wydarzenia łącznie z podłączonymi integracjami. Możesz dodawać własne i w dowolnym momencie włączać/wyłączać synchronizację."
            : "Dodawaj własne wydarzenia albo podłącz integracje (Google, Kadromierz, Akademia), by wszystko wyświetlać w jednym miejscu."}
        </p>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
          primaryHref="/account?tab=integrations"
          primaryLabel={googleConnected ? "Ustawienia" : "Połącz Google"}
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
          primaryHref="/account?tab=integrations"
          primaryLabel={kadromierzConnected ? "Ustawienia" : "Skonfiguruj"}
        />
        {moodleHasRole && (
          <IntegrationCard
            icon={
              <GraduationCap
                className="w-6 h-6 text-amber-500"
                aria-hidden="true"
              />
            }
            iconBg="bg-amber-500/10"
            title="Akademia — kalendarz"
            description={
              moodleStatus?.reason === "not_provisioned"
                ? "Zaloguj się raz do Akademii, aby zainicjalizować konto"
                : moodleStatus?.reason === "unreachable"
                  ? "Akademia chwilowo niedostępna — odśwież za chwilę"
                  : "Terminy szkoleń, zadań i wydarzeń kursów z Moodle"
            }
            connected={true}
            loading={accountLoading}
            primaryHref="https://moodle.myperformance.pl/"
            primaryLabel="Otwórz Akademię"
          />
        )}
      </section>

      <CalendarTab />
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
  primaryHref,
  primaryLabel,
  secondaryLabel,
  secondaryIcon,
  onSecondary,
  secondaryLoading,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  connected: boolean;
  loading: boolean;
  primaryHref: string;
  primaryLabel: string;
  secondaryLabel?: string;
  secondaryIcon?: React.ReactNode;
  onSecondary?: () => void | Promise<void>;
  secondaryLoading?: boolean;
}) {
  const isExternal = /^https?:\/\//.test(primaryHref);
  return (
    <Card padding="md" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
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
      <div className="flex justify-end flex-wrap gap-2">
        {secondaryLabel && onSecondary && (
          <Button
            size="sm"
            variant="ghost"
            loading={!!secondaryLoading}
            leftIcon={secondaryIcon}
            onClick={() => {
              void onSecondary();
            }}
          >
            {secondaryLabel}
          </Button>
        )}
        {isExternal ? (
          <a href={primaryHref} target="_blank" rel="noopener noreferrer">
            <Button
              size="sm"
              variant={connected ? "secondary" : "primary"}
              leftIcon={<Plug className="w-4 h-4" aria-hidden="true" />}
            >
              {primaryLabel}
            </Button>
          </a>
        ) : (
          <Link href={primaryHref}>
            <Button
              size="sm"
              variant={connected ? "secondary" : "primary"}
              leftIcon={<Plug className="w-4 h-4" aria-hidden="true" />}
            >
              {primaryLabel}
            </Button>
          </Link>
        )}
      </div>
    </Card>
  );
}
