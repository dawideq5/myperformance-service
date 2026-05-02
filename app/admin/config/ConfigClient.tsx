"use client";

import {
  Bell,
  Mail,
  MapPin,
  Settings,
  Tags,
  Wrench,
} from "lucide-react";
import { Card, PageShell } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { ConfigTile, type ConfigTileAccent } from "./ConfigTile";

interface ConfigClientProps {
  userLabel?: string;
  userEmail?: string;
}

interface TileDef {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  accent: ConfigTileAccent;
}

// Wszystkie kafelki idą przez wspólny komponent ConfigTile (jeden schemat
// layoutu). Bez hardcoded wariantów — różni się tylko ikona, tytuł, opis,
// docelowy href, kolor akcentu.
const TILES: TileDef[] = [
  {
    title: "Punkty",
    description: "Punkty sprzedażowe i serwisowe — adresy, GPS, godziny pracy",
    href: "/admin/locations",
    icon: <MapPin className="w-6 h-6" />,
    accent: "sky",
  },
  {
    title: "Cennik",
    description: "Pozycje cennika — ceny, marki, modele, gwarancje",
    href: "/admin/pricelist",
    icon: <Tags className="w-6 h-6" />,
    accent: "emerald",
  },
  {
    title: "Typy napraw",
    description: "Katalog rodzajów napraw — gwarancja, czas, reguły łączenia",
    href: "/admin/repair-types",
    icon: <Wrench className="w-6 h-6" />,
    accent: "amber",
  },
  {
    title: "Komunikaty",
    description: "Wydarzenia widoczne dla użytkowników na dashboardzie",
    href: "/admin/announcements",
    icon: <Bell className="w-6 h-6" />,
    accent: "rose",
  },
  {
    title: "Korespondencja e-mail",
    description: "Cały ruch mailowy + Chatwoot dla zweryfikowanych adresów",
    href: "/admin/correspondence",
    icon: <Mail className="w-6 h-6" />,
    accent: "blue",
  },
];

/**
 * Hub `/admin/config`. Tile-based — każdy kafelek prowadzi do dedykowanej
 * pod-strony admina (np. /admin/locations, /admin/pricelist).
 *
 * Usunięte: kafelki "Przegląd", "Powiązania cert ↔ punkty", "Certyfikaty"
 * (legacy w nowym modelu mTLS hard-locked, certy edytuje się w
 * /admin/certificates poza configem).
 */
export function ConfigClient({ userLabel, userEmail }: ConfigClientProps) {
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
                Punkty, cennik, typy napraw i komunikaty systemowe w jednym
                miejscu. Zmiany odzwierciedlają się natychmiast w panelu
                sprzedawcy / serwisanta i na dashboardzie użytkowników.
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TILES.map((t) => (
            <ConfigTile
              key={t.href}
              icon={t.icon}
              title={t.title}
              description={t.description}
              href={t.href}
              accent={t.accent}
            />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
