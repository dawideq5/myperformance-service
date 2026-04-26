"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { Lightbulb, X } from "lucide-react";
import { Card } from "./Card";
import { usePreferences } from "@/hooks/usePreferences";
import { userHasAreaClient } from "@/lib/permissions/access-client";

interface Props {
  /** Klucz w sessionStorage — kart jest schowana tylko do następnego F5. */
  storageKey: string;
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  /**
   * Jeśli ustawione — kart pokazuje się tylko userom z dostępem do tego
   * area (sprawdzane po `session.user.roles` vs AREAS rejestru).
   * Superadmin (`realm-management:realm-admin` lub `manage-realm`) widzi zawsze.
   */
  requiresArea?: string;
  /** Min priority (10/50/90) wymagana dla area. Domyślnie 1 (jakakolwiek rola). */
  requiresMinPriority?: number;
}

/**
 * Onboarding/explainer card. Zamknięcie = sessionStorage (do następnego
 * odświeżenia). User wyłączający wskazówki w ustawieniach (`hintsEnabled=false`)
 * nie widzi ich w ogóle. Filtrowanie po area — pokazujemy tylko jeśli user
 * ma jakąkolwiek rolę w danym obszarze.
 */
export function OnboardingCard({
  storageKey,
  title,
  children,
  icon,
  requiresArea,
  requiresMinPriority = 1,
}: Props) {
  const { data: session } = useSession();
  const { prefs, loading } = usePreferences();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const fullKey = `mp_onboarding_${storageKey}`;

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(fullKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [fullKey]);

  if (dismissed === null || dismissed) return null;
  if (loading) return null;
  if (prefs && prefs.hintsEnabled === false) return null;

  if (requiresArea) {
    const roles = (session?.user?.roles as string[] | undefined) ?? [];
    if (!userHasAreaClient(roles, requiresArea, requiresMinPriority)) return null;
  }

  function dismiss() {
    try {
      sessionStorage.setItem(fullKey, "1");
    } catch {}
    setDismissed(true);
  }

  return (
    <Card
      padding="md"
      className="border-[var(--accent)]/30 bg-[var(--accent)]/5 animate-slide-up"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
          {icon ?? <Lightbulb className="w-5 h-5 text-[var(--accent)]" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base mb-1.5 text-[var(--text-main)]">
            {title}
          </div>
          <div className="text-sm text-[var(--text-main)]/85 leading-relaxed">
            {children}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1.5 -m-1 text-[var(--text-main)]/60 hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] rounded-md transition-colors"
          aria-label="Zamknij wskazówkę"
          title="Schowaj do następnego odświeżenia (F5)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}
