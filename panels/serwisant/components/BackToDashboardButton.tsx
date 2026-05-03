"use client";

import { ArrowLeft } from "lucide-react";
import { DASHBOARD_HOME_URL } from "@/lib/dashboard-url";

/**
 * Explicit "Powrót do pulpitu" link w top-barze panelu.
 *
 * Styling spójny z sąsiadującym przyciskiem "Wyloguj" — `text-xs font-medium`,
 * `var(--text-muted)`, `p-2 rounded-lg`. Na mobile pokazuje się sama ikona
 * (label `hidden lg:inline`), na desktopie pełen napis.
 *
 * Komponent jest duplikowany 1:1 w trzech panelach (sprzedawca/serwisant/
 * kierowca), bo każdy panel ma własny `@/*` alias i własny
 * `DASHBOARD_HOME_URL`. Trzymaj wszystkie trzy kopie identyczne.
 */
export function BackToDashboardButton() {
  return (
    <a
      href={DASHBOARD_HOME_URL}
      className="p-2 rounded-lg flex items-center gap-1.5 text-xs font-medium border"
      style={{
        color: "var(--text-muted)",
        borderColor: "var(--border-subtle)",
      }}
      aria-label="Powrót do pulpitu"
      title="Powrót do pulpitu"
    >
      <ArrowLeft className="w-4 h-4" />
      <span className="hidden lg:inline">Powrót do pulpitu</span>
    </a>
  );
}
