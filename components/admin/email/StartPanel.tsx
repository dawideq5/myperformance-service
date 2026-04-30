"use client";

import {
  Layers,
  Mail,
  Palette,
  Server,
  Settings as SettingsIcon,
} from "lucide-react";

import { Alert, Card } from "@/components/ui";

import { DirectusSyncCard } from "./parts/DirectusSyncCard";
import { NavTile } from "./parts/NavTile";
import type { TabId } from "./types";

export function StartPanel({ onGoTo }: { onGoTo: (t: TabId) => void }) {
  return (
    <div className="space-y-3">
      <Card padding="lg">
        <h2 className="text-lg font-semibold text-[var(--text-main)] mb-2">
          Centralne zarządzanie emailem
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Wszystkie maile wysyłane przez stack — zebrane, edytowalne, z
          podglądem na żywo. Każda akcja ma swój szablon, który możesz
          dostosować lub wyłączyć.
        </p>
      </Card>

      <Alert tone="info" title="Synchronizacja z Directus CMS — automatyczna">
        <p>
          Każda zmiana brandingu lub szablonu w tym panelu jest natychmiast
          zapisywana TAKŻE w Directus CMS (kolekcje{" "}
          <code className="font-mono text-[11px]">mp_branding_cms</code> i{" "}
          <code className="font-mono text-[11px]">mp_email_templates_cms</code>
          ). Content team może je tam oglądać; edycja w Directusie zostanie
          nadpisana przy kolejnym zapisie z dashboardu — dashboard pozostaje
          source of truth.
        </p>
      </Alert>

      <NavTile
        icon={<Mail className="w-5 h-5 text-emerald-400" />}
        title="Szablony emaili"
        description={
          'Lista wszystkich akcji w stacku. Każdy szablon: subject + treść + zmienne (wstaw przez „/"), live HTML preview, włącz/wyłącz, przypisz SMTP.'
        }
        cta="Otwórz szablony"
        onClick={() => onGoTo("templates")}
      />
      <NavTile
        icon={<Layers className="w-5 h-5 text-fuchsia-400" />}
        title="Wygląd / layout"
        description="Globalny szkielet maila — header MyPerformance, biel/czerń, slot {{content}} dla treści. Możesz mieć kilka wersji (np. transactional vs newsletter)."
        cta="Edytuj layout"
        onClick={() => onGoTo("layouts")}
      />
      <NavTile
        icon={<SettingsIcon className="w-5 h-5 text-amber-400" />}
        title="Konfiguracje SMTP"
        description='Aliasy: "transactional", "marketing" itp. Każdy szablon przypisujesz do aliasa — alias to host + login + nadawca. Tu zarządzasz wszystkimi.'
        cta="Konfiguruj SMTP"
        onClick={() => onGoTo("smtp")}
      />
      <NavTile
        icon={<Palette className="w-5 h-5 text-sky-400" />}
        title="Branding"
        description="Globalne dane marki (nazwa, logo, kolor) propagowane do envów aplikacji."
        cta="Edytuj branding"
        onClick={() => onGoTo("branding")}
      />
      <NavTile
        icon={<Server className="w-5 h-5 text-cyan-400" />}
        title="Postal (infrastruktura)"
        description="Niskopoziomowe zarządzanie naszym serwerem pocztowym Postal — organizacje, serwery, klucze, domeny."
        cta="Otwórz Postal"
        onClick={() => onGoTo("postal")}
      />
      <DirectusSyncCard />
    </div>
  );
}
