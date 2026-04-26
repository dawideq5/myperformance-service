"use client";

import { type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { Lightbulb } from "lucide-react";
import { Card } from "./Card";
import { usePreferences } from "@/hooks/usePreferences";
import { userHasAreaClient } from "@/lib/permissions/access-client";

interface Props {
  /** Klucz pozostawiony dla kompatybilności call-site'ów (nieużywany). */
  storageKey: string;
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  /** Filter po area — kart pokazuje się tylko userom z dostępem. */
  requiresArea?: string;
  requiresMinPriority?: number;
}

/**
 * Onboarding/explainer card. Pokazuje się gdy `prefs.hintsEnabled` (default
 * true). Wyłączyć/włączyć tylko z Preferencji konta — bez przycisku „X" na
 * karcie. Filtrowanie po area — pokazujemy tylko userom z dostępem.
 */
export function OnboardingCard({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  storageKey: _storageKey,
  title,
  children,
  icon,
  requiresArea,
  requiresMinPriority = 1,
}: Props) {
  const { data: session } = useSession();
  const { prefs, loading } = usePreferences();

  if (loading) return null;
  if (prefs && prefs.hintsEnabled === false) return null;

  if (requiresArea) {
    const roles = (session?.user?.roles as string[] | undefined) ?? [];
    if (!userHasAreaClient(roles, requiresArea, requiresMinPriority)) return null;
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
      </div>
    </Card>
  );
}
