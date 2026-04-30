"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Ban,
  Globe,
  HardDrive,
  Server,
  Shield,
  ShieldAlert,
} from "lucide-react";
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

type TabId =
  | "vps"
  | "dns"
  | "resources"
  | "security"
  | "blocks"
  | "map"
  | "devices"
  | "wazuh";

export function InfrastructureClient({
  userLabel,
  userEmail,
}: {
  userLabel?: string;
  userEmail?: string;
}) {
  const [tab, setTab] = useState<TabId>("vps");
  const tabs: TabDefinition<TabId>[] = useMemo(
    () => [
      {
        id: "vps",
        label: "VPS + Backup",
        icon: <Server className="w-5 h-5" />,
        dataAttributes: { "data-tour": "tab-vps" },
      },
      { id: "dns", label: "DNS Zone", icon: <Globe className="w-5 h-5" /> },
      {
        id: "resources",
        label: "Zasoby (CPU/RAM/Disk)",
        icon: <Activity className="w-5 h-5" />,
      },
      {
        id: "security",
        label: "Bezpieczeństwo / Alerty",
        icon: <ShieldAlert className="w-5 h-5" />,
      },
      {
        id: "blocks",
        label: "Threat Intel — IP",
        icon: <Ban className="w-5 h-5" />,
        dataAttributes: { "data-tour": "tab-blocks" },
      },
      {
        id: "map",
        label: "Mapa & analityka",
        icon: <Globe className="w-5 h-5" />,
        dataAttributes: { "data-tour": "tab-map" },
      },
      {
        id: "devices",
        label: "Urządzenia",
        icon: <HardDrive className="w-5 h-5" />,
      },
      { id: "wazuh", label: "Wazuh SIEM", icon: <Shield className="w-5 h-5" /> },
    ],
    [],
  );

  // Mapowanie naszego TabId → SecurityTabId dla DashboardPanel.onGoTo
  const goToSecurityTab = (st: SecurityTabId) => {
    if (st === "dashboard") setTab("security");
    else if (st === "events") setTab("security");
    else if (st === "blocks") setTab("blocks");
    else if (st === "agents") setTab("wazuh");
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
          <TabPanel tabId="vps" active={tab === "vps"}>
            <VpsPanel />
          </TabPanel>
          <TabPanel tabId="dns" active={tab === "dns"}>
            <DnsPanel />
          </TabPanel>
          <TabPanel tabId="resources" active={tab === "resources"}>
            <ResourcesPanel />
          </TabPanel>
          <TabPanel tabId="security" active={tab === "security"}>
            <div className="space-y-6">
              <SecurityDashboardPanel onGoTo={goToSecurityTab} />
              <SecurityEventsPanel />
            </div>
          </TabPanel>
          <TabPanel tabId="blocks" active={tab === "blocks"}>
            <IntelBlocksPanel />
          </TabPanel>
          <TabPanel tabId="map" active={tab === "map"}>
            <EventMapPanel />
          </TabPanel>
          <TabPanel tabId="devices" active={tab === "devices"}>
            <DevicesPanel />
          </TabPanel>
          <TabPanel tabId="wazuh" active={tab === "wazuh"}>
            <WazuhPanel />
          </TabPanel>
        </div>
      </div>
    </PageShell>
  );
}
