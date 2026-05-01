"use client";

import { useMemo, useState } from "react";
import { Globe, Map, Monitor, Server, ShieldAlert } from "lucide-react";
import {
  PageShell,
  TabPanel,
  Tabs,
  type TabDefinition,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import {
  DashboardPanel as SecurityDashboardPanel,
  EventsPanel as SecurityEventsPanel,
  AgentsPanel as WazuhPanel,
  type TabId as SecurityTabId,
} from "@/app/admin/security/SecurityClient";
import { IntelBlocksPanel } from "./IntelBlocksPanel";
import { EventMapPanel } from "./EventMapPanel";
import { DevicesPanel } from "./DevicesPanel";
import { VpsPanel } from "@/components/admin/infrastructure/VpsPanel";
import { DnsPanel } from "@/components/admin/infrastructure/DnsPanel";
import { ResourcesPanel } from "@/components/admin/infrastructure/ResourcesPanel";

type TabId = "server" | "dns" | "security" | "map" | "devices";
type SecuritySubTab = "alerts" | "intel" | "siem";

export function InfrastructureClient({
  userLabel,
  userEmail,
}: {
  userLabel?: string;
  userEmail?: string;
}) {
  const [tab, setTab] = useState<TabId>("server");
  const [securitySub, setSecuritySub] = useState<SecuritySubTab>("alerts");

  const tabs: TabDefinition<TabId>[] = useMemo(
    () => [
      {
        id: "server",
        label: "Serwer",
        icon: <Server className="w-5 h-5" />,
        dataAttributes: { "data-tour": "tab-vps" },
      },
      {
        id: "dns",
        label: "DNS & Sieć",
        icon: <Globe className="w-5 h-5" />,
      },
      {
        id: "security",
        label: "Bezpieczeństwo",
        icon: <ShieldAlert className="w-5 h-5" />,
      },
      {
        id: "map",
        label: "Mapa ataków",
        icon: <Map className="w-5 h-5" />,
        dataAttributes: { "data-tour": "tab-map" },
      },
      {
        id: "devices",
        label: "Urządzenia",
        icon: <Monitor className="w-5 h-5" />,
      },
    ],
    [],
  );

  // Mapowanie SecurityTabId → naszego TabId (używane przez DashboardPanel.onGoTo)
  const goToSecurityTab = (st: SecurityTabId) => {
    setTab("security");
    if (st === "agents") setSecuritySub("siem");
    else if (st === "blocks") setSecuritySub("intel");
    else setSecuritySub("alerts");
  };

  const header = (
    <AppHeader
      backHref="/dashboard"
      title="Infrastruktura serwera"
      userLabel={userLabel}
      userSubLabel={userEmail}
    />
  );

  return (
    <PageShell maxWidth="xl" header={header}>
      <div className="grid lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1">
          <Tabs
            tabs={tabs}
            activeTab={tab}
            onChange={setTab}
            orientation="vertical"
            ariaLabel="Sekcje infrastruktury serwera"
          />
        </aside>
        <div className="lg:col-span-3 space-y-6">
          {/* Serwer — VPS + Zasoby */}
          <TabPanel tabId="server" active={tab === "server"}>
            <div className="space-y-6">
              <VpsPanel />
              <ResourcesPanel />
            </div>
          </TabPanel>

          {/* DNS & Sieć */}
          <TabPanel tabId="dns" active={tab === "dns"}>
            <DnsPanel />
          </TabPanel>

          {/* Bezpieczeństwo — Alerty + Threat Intel + Wazuh SIEM */}
          <TabPanel tabId="security" active={tab === "security"}>
            <div className="space-y-4">
              {/* Sub-tabs pill style */}
              <div className="flex gap-1.5 flex-wrap">
                {(
                  [
                    { id: "alerts" as SecuritySubTab, label: "Alerty" },
                    { id: "intel" as SecuritySubTab, label: "Threat Intel" },
                    { id: "siem" as SecuritySubTab, label: "Wazuh SIEM" },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSecuritySub(id)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      securitySub === id
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-main)] font-medium"
                        : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {securitySub === "alerts" && (
                <div className="space-y-6">
                  <SecurityDashboardPanel onGoTo={goToSecurityTab} />
                  <SecurityEventsPanel />
                </div>
              )}
              {securitySub === "intel" && <IntelBlocksPanel />}
              {securitySub === "siem" && <WazuhPanel />}
            </div>
          </TabPanel>

          {/* Mapa ataków — Leaflet */}
          <TabPanel tabId="map" active={tab === "map"}>
            <EventMapPanel />
          </TabPanel>

          {/* Urządzenia */}
          <TabPanel tabId="devices" active={tab === "devices"}>
            <DevicesPanel />
          </TabPanel>
        </div>
      </div>
    </PageShell>
  );
}
