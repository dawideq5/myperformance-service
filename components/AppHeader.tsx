"use client";

import type { ReactNode } from "react";

/**
 * @deprecated Zastąpione przez `<UnifiedTopBar>` mountowany globalnie
 * w `app/layout.tsx`.
 *
 * Komponent jest API-compatible shim — zwraca `null`, więc istniejące
 * wywołania `<AppHeader ... />` w stronach admin/dashboard nie tworzą
 * duplikowanego nagłówka. Wszystkie funkcje (logo, search, bell, user,
 * settings, logout) są obsłużone przez UnifiedTopBar.
 *
 * TODO cleanup: usunąć wszystkie wywołania `<AppHeader>` z `app/**` oraz
 * usunąć ten plik.
 */
export interface AppHeaderProps {
  userLabel?: string;
  userSubLabel?: string;
  showAccountLink?: boolean;
  /** Legacy — TopBar nie wyświetla "Powrót / Tytuł". */
  backHref?: string;
  /** Legacy — nazwa widoku jest teraz w animowanym logo. */
  title?: string;
  /** Legacy — dodatkowe kontrolki w prawym górnym rogu. */
  rightExtras?: ReactNode;
}

export function AppHeader(_props: AppHeaderProps) {
  // No-op shim. UnifiedTopBar jest globalny w root layout.
  return null;
}
