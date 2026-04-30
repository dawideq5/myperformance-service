"use client";

import { useState } from "react";
import {
  FileSignature,
  Layers,
  LinkIcon,
  MapPin,
  Settings,
  Tags,
} from "lucide-react";
import {
  Card,
  PageShell,
  TabPanel,
  Tabs,
  type TabDefinition,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import type { Location } from "@/lib/locations";
import type { CertLinkRow, ConfigOverviewStats } from "@/lib/config-overview";
import type { ConfigTabId } from "@/lib/services/config-service";
import { OverviewPanel } from "@/components/admin/config/OverviewPanel";
import { CertBindingPanel } from "@/components/admin/config/CertBindingPanel";
import { LocationsPanel } from "@/components/admin/config/LocationsPanel";
import { TargetGroupsPanel } from "@/components/admin/config/TargetGroupsPanel";
import {
  CertsSummary,
  PricingPanel,
} from "@/components/admin/config/PricingPanel";

interface ConfigClientProps {
  stats: ConfigOverviewStats;
  links: CertLinkRow[];
  locations: Location[];
  userLabel?: string;
  userEmail?: string;
}

const TABS: TabDefinition<ConfigTabId>[] = [
  { id: "overview", label: "Przegląd", icon: <Layers className="w-4 h-4" /> },
  {
    id: "links",
    label: "Powiązania cert ↔ punkty",
    icon: <LinkIcon className="w-4 h-4" />,
  },
  {
    id: "locations",
    label: "Punkty",
    icon: <MapPin className="w-4 h-4" />,
  },
  {
    id: "targets",
    label: "Grupy targetowe",
    icon: <Tags className="w-4 h-4" />,
  },
  {
    id: "certs",
    label: "Certyfikaty",
    icon: <FileSignature className="w-4 h-4" />,
  },
  {
    id: "pricelist",
    label: "Cennik",
    icon: <Tags className="w-4 h-4" />,
  },
];

/**
 * Shell dla `/admin/config`. Trzyma state aktywnej zakładki + stronę-ramkę,
 * delegując treść kafli do odpowiednich paneli (`components/admin/config/*`).
 *
 * Pure helpery (validators, format) żyją w `lib/services/config-service.ts`.
 */
export function ConfigClient({
  stats,
  links,
  locations,
  userLabel,
  userEmail,
}: ConfigClientProps) {
  const [tab, setTab] = useState<ConfigTabId>("overview");

  return (
    <PageShell
      maxWidth="2xl"
      header={
        <AppHeader
          userLabel={userLabel}
          userSubLabel={userEmail}
          backHref="/dashboard"
          title="Zarządzanie konfiguracją"
        />
      }
    >
      <div className="space-y-4">
        <Card
          padding="lg"
          className="bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-surface)]"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
              <Settings className="w-6 h-6 text-[var(--accent)]" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold mb-1">
                Centralne zarządzanie konfiguracją
              </h1>
              <p className="text-sm text-[var(--text-muted)] max-w-2xl">
                Punkty sprzedażowe i serwisowe, certyfikaty klienckie mTLS i
                powiązania między nimi w jednym miejscu. Zmiany odzwierciedlają
                się natychmiast w panelu sprzedawcy / serwisanta.
              </p>
            </div>
          </div>
        </Card>

        <Tabs<ConfigTabId>
          tabs={TABS}
          activeTab={tab}
          onChange={setTab}
          orientation="horizontal"
        />

        <TabPanel tabId="overview" active={tab === "overview"}>
          <OverviewPanel stats={stats} />
        </TabPanel>

        <TabPanel tabId="links" active={tab === "links"}>
          <CertBindingPanel links={links} />
        </TabPanel>

        <TabPanel tabId="locations" active={tab === "locations"}>
          <LocationsPanel locations={locations} />
        </TabPanel>

        <TabPanel tabId="targets" active={tab === "targets"}>
          <TargetGroupsPanel />
        </TabPanel>

        <TabPanel tabId="certs" active={tab === "certs"}>
          <CertsSummary />
        </TabPanel>

        <TabPanel tabId="pricelist" active={tab === "pricelist"}>
          <PricingPanel />
        </TabPanel>
      </div>
    </PageShell>
  );
}
