"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Lightbulb, X } from "lucide-react";
import { Card } from "./Card";

interface Props {
  /** Unikalny klucz w localStorage żeby raz dismissed nie pokazywał się więcej. */
  storageKey: string;
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}

/**
 * Pierwsza-wizyta explainer card — pokazuje się dopóki user nie zamknie.
 * Stan zapisany w localStorage (`mp_onboarding_<storageKey>`).
 */
export function OnboardingCard({ storageKey, title, children, icon }: Props) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const fullKey = `mp_onboarding_${storageKey}`;

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(fullKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [fullKey]);

  if (dismissed === null || dismissed) return null;

  function dismiss() {
    try {
      localStorage.setItem(fullKey, "1");
    } catch {}
    setDismissed(true);
  }

  return (
    <Card
      padding="md"
      className="border-[var(--accent)]/30 bg-[var(--accent)]/5"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[var(--accent)]/15 flex items-center justify-center flex-shrink-0">
          {icon ?? <Lightbulb className="w-5 h-5 text-[var(--accent)]" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm mb-1">{title}</div>
          <div className="text-xs text-[var(--text-muted)] leading-relaxed">
            {children}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 -m-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
          aria-label="Zamknij wskazówkę"
          title="Nie pokazuj więcej"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}
