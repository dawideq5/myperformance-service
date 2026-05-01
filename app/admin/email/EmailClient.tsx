"use client";

import { useMemo, useState } from "react";
import {
  Info,
  Layers,
  Mail,
  Palette,
  Send,
  Server,
  Settings as SettingsIcon,
} from "lucide-react";

import {
  OnboardingCard,
  PageShell,
  TabPanel,
  Tabs,
  type TabDefinition,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";

import { BrandingPanel } from "@/components/admin/email/BrandingPanel";
import { LayoutsPanel } from "@/components/admin/email/LayoutsPanel";
import { PostalPanel } from "@/components/admin/email/PostalPanel";
import { SmtpPanel } from "@/components/admin/email/SmtpPanel";
import { SmtpProfilesPanel } from "@/components/admin/email/SmtpProfilesPanel";
import { StartPanel } from "@/components/admin/email/StartPanel";
import { TemplatesPanel } from "@/components/admin/email/TemplatesPanel";
import type { TabId } from "@/components/admin/email/types";

export function EmailClient({
  userLabel,
  userEmail,
}: {
  userLabel?: string;
  userEmail?: string;
}) {
  const [tab, setTab] = useState<TabId>("start");

  const tabs: TabDefinition<TabId>[] = useMemo(
    () => [
      { id: "start", label: "Start", icon: <Info className="w-5 h-5" /> },
      {
        id: "templates",
        label: "Szablony emaili",
        icon: <Mail className="w-5 h-5" />,
        dataAttributes: { "data-tour": "tab-templates" },
      },
      {
        id: "layouts",
        label: "Wygląd / layout",
        icon: <Layers className="w-5 h-5" />,
      },
      {
        id: "smtp",
        label: "Konfiguracje SMTP",
        icon: <SettingsIcon className="w-5 h-5" />,
      },
      {
        id: "smtp-profiles",
        label: "Profile SMTP (per marka)",
        icon: <Send className="w-5 h-5" />,
      },
      {
        id: "branding",
        label: "Branding",
        icon: <Palette className="w-5 h-5" />,
        dataAttributes: { "data-tour": "tab-branding" },
      },
      {
        id: "postal",
        label: "Postal (infrastruktura)",
        icon: <Server className="w-5 h-5" />,
      },
    ],
    [],
  );

  const header = (
    <AppHeader
      backHref="/dashboard"
      title="Email — centralne zarządzanie"
      userLabel={userLabel}
      userSubLabel={userEmail}
    />
  );

  return (
    <PageShell maxWidth="xl" header={header}>
      <OnboardingCard
        storageKey="admin-email"
        title="Wszystkie maile w jednym miejscu"
        requiresArea="email-admin"
        requiresMinPriority={90}
      >
        Edytujesz tu szablony Keycloak (login/reset/verify), branding
        propagujący się do wszystkich apek, konfiguracje SMTP i serwer Postal
        (domeny, skrzynki, DKIM/SPF). Każdy szablon ma podgląd na żywo + test
        send.
      </OnboardingCard>
      <div className="grid lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1">
          <Tabs
            tabs={tabs}
            activeTab={tab}
            onChange={setTab}
            orientation="vertical"
            ariaLabel="Sekcje email"
          />
        </aside>
        <div className="lg:col-span-3 space-y-6">
          <TabPanel tabId="start" active={tab === "start"}>
            <StartPanel onGoTo={setTab} />
          </TabPanel>
          <TabPanel tabId="templates" active={tab === "templates"}>
            <TemplatesPanel />
          </TabPanel>
          <TabPanel tabId="layouts" active={tab === "layouts"}>
            <LayoutsPanel />
          </TabPanel>
          <TabPanel tabId="smtp" active={tab === "smtp"}>
            <SmtpPanel />
          </TabPanel>
          <TabPanel tabId="smtp-profiles" active={tab === "smtp-profiles"}>
            <SmtpProfilesPanel />
          </TabPanel>
          <TabPanel tabId="branding" active={tab === "branding"}>
            <BrandingPanel />
          </TabPanel>
          <TabPanel tabId="postal" active={tab === "postal"}>
            <PostalPanel />
          </TabPanel>
        </div>
      </div>
    </PageShell>
  );
}
