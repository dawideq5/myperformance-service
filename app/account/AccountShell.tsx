"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  History,
  Mail,
  Plug,
  Settings,
  Shield,
  User as UserIcon,
} from "lucide-react";

import {
  Alert,
  Badge,
  PageHeader,
  PageShell,
  Skeleton,
  TabPanel,
  Tabs,
  type TabDefinition,
} from "@/components/ui";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import { ProfileTab } from "@/app/account/components/ProfileTab";
import { SecurityTab } from "@/app/account/components/SecurityTab";
import { SessionsTab } from "@/app/account/components/SessionsTab";
import { IntegrationsTab } from "@/app/account/components/IntegrationsTab";
import { PreferencesTab } from "@/app/account/components/PreferencesTab";
import { CorrespondenceTab } from "@/app/account/components/CorrespondenceTab";

import { useAccount } from "./AccountProvider";
import type { AccountTabId } from "./types";

const TAB_IDS: readonly AccountTabId[] = [
  "profile",
  "security",
  "sessions",
  "integrations",
  "correspondence",
  "preferences",
];

function isValidTab(value: string | null): value is AccountTabId {
  return !!value && (TAB_IDS as readonly string[]).includes(value);
}

export function AccountShell() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { softLogout } = useAuthRedirect();

  const sessionError = session?.error;
  const accessToken = session?.accessToken;

  const {
    status: accountStatus,
    error: accountError,
    profile,
    sessions,
    googleStatus,
  } = useAccount();

  const activeTab: AccountTabId = useMemo(() => {
    const raw = searchParams.get("tab");
    return isValidTab(raw) ? raw : "profile";
  }, [searchParams]);

  const setActiveTab = useCallback(
    (tab: AccountTabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "profile") params.delete("tab");
      else params.set("tab", tab);
      const qs = params.toString();
      router.replace(qs ? `/account?${qs}` : "/account", { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (sessionError === "RefreshTokenExpired") void softLogout();
  }, [sessionError, softLogout]);

  const hasValidSession =
    status === "authenticated" &&
    !!accessToken &&
    sessionError !== "RefreshTokenExpired";

  const fullName =
    profile?.firstName || profile?.lastName
      ? `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim()
      : session?.user?.name ?? session?.user?.email ?? "";

  const header = (
    <PageHeader
      left={
        <>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            <span className="text-sm font-medium">Powrót</span>
          </Link>
          <div className="h-6 w-px bg-[var(--border-subtle)]" aria-hidden="true" />
          <h1 className="text-xl font-bold text-[var(--text-main)]">
            Zarządzanie kontem
          </h1>
        </>
      }
      right={
        (fullName || profile?.email) && (
          <div className="hidden sm:flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
            </div>
            <div className="text-right leading-tight">
              {fullName && (
                <p className="text-sm font-medium text-[var(--text-main)]">
                  {fullName}
                </p>
              )}
              {profile?.email && (
                <p className="text-xs text-[var(--text-muted)]">{profile.email}</p>
              )}
            </div>
          </div>
        )
      }
    />
  );

  if (status === "loading" || (hasValidSession && accountStatus === "loading")) {
    return (
      <PageShell maxWidth="xl" header={header}>
        <div className="grid lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </aside>
          <section className="lg:col-span-3 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </section>
        </div>
      </PageShell>
    );
  }

  if (!hasValidSession) return null;

  if (accountStatus === "error") {
    return (
      <PageShell maxWidth="xl" header={header}>
        <div className="max-w-lg mx-auto pt-8">
          <Alert tone="error" title="Nie udało się pobrać danych konta">
            <p>{accountError ?? "Wystąpił nieznany błąd."}</p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4" aria-hidden="true" />
              <span>Spróbuj odświeżyć stronę.</span>
            </div>
          </Alert>
        </div>
      </PageShell>
    );
  }

  const googleConnected = googleStatus?.connected === true;

  const tabs: TabDefinition<AccountTabId>[] = [
    { id: "profile", label: "Profil", icon: <UserIcon className="w-5 h-5" /> },
    {
      id: "security",
      label: "Bezpieczeństwo",
      icon: <Shield className="w-5 h-5" />,
      dataAttributes: { "data-tour": "tab-security" },
    },
    {
      id: "sessions",
      label: "Sesje",
      icon: <History className="w-5 h-5" />,
      badge:
        sessions.length > 0 ? (
          <Badge tone="neutral">{sessions.length}</Badge>
        ) : undefined,
      dataAttributes: { "data-tour": "tab-sessions" },
    },
    {
      id: "integrations",
      label: "Integracje",
      icon: <Plug className="w-5 h-5" />,
      badge: googleConnected ? (
        <span
          className="w-2 h-2 bg-green-500 rounded-full"
          aria-label="Połączone"
        />
      ) : undefined,
    },
    {
      id: "correspondence",
      label: "Korespondencja",
      icon: <Mail className="w-5 h-5" />,
    },
    {
      id: "preferences",
      label: "Preferencje",
      icon: <Settings className="w-5 h-5" />,
      dataAttributes: { "data-tour": "tab-preferences" },
    },
  ];

  const safeActiveTab: AccountTabId = activeTab;

  return (
    <PageShell maxWidth="xl" header={header}>
      <div className="grid lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1">
          <Tabs
            tabs={tabs}
            activeTab={safeActiveTab}
            onChange={setActiveTab}
            orientation="vertical"
            ariaLabel="Sekcje konta"
          />
        </aside>

        <div className="lg:col-span-3">
          <TabPanel tabId="profile" active={safeActiveTab === "profile"}>
            <ProfileTab />
          </TabPanel>

          <TabPanel tabId="security" active={safeActiveTab === "security"}>
            <SecurityTab />
          </TabPanel>

          <TabPanel tabId="sessions" active={safeActiveTab === "sessions"}>
            <SessionsTab />
          </TabPanel>

          <TabPanel tabId="integrations" active={safeActiveTab === "integrations"}>
            <IntegrationsTab />
          </TabPanel>

          <TabPanel tabId="correspondence" active={safeActiveTab === "correspondence"}>
            <CorrespondenceTab />
          </TabPanel>

          <TabPanel tabId="preferences" active={safeActiveTab === "preferences"}>
            <PreferencesTab />
          </TabPanel>
        </div>
      </div>
    </PageShell>
  );
}
