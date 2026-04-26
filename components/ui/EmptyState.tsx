"use client";

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  /** Ikona Lucide do wyświetlenia, default Inbox. */
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Punkty co user może zrobić żeby tu pojawiły się dane. */
  hints?: ReactNode[];
  /** Akcja primary (np. button "Otwórz Wazuh"). */
  action?: ReactNode;
  /** Subtelna prezentacja zamiast bigger. */
  compact?: boolean;
}

/**
 * Empty state z konstruktywnym next-step zamiast suchego "Brak danych".
 * Małe `compact` dla list per sekcja, full-size dla całych zakładek.
 */
export function EmptyState({
  icon,
  title,
  description,
  hints,
  action,
  compact = false,
}: EmptyStateProps) {
  if (compact) {
    return (
      <div className="text-center py-6 px-4">
        <div className="flex justify-center mb-2 text-[var(--text-muted)]">
          {icon ?? <Inbox className="w-6 h-6" />}
        </div>
        <div className="text-sm font-medium mb-1">{title}</div>
        {description && (
          <div className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
            {description}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="text-center py-10 px-6">
      <div className="flex justify-center mb-4">
        <div className="w-14 h-14 rounded-2xl bg-[var(--bg-main)] flex items-center justify-center text-[var(--text-muted)]">
          {icon ?? <Inbox className="w-7 h-7" />}
        </div>
      </div>
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto mb-4">
          {description}
        </p>
      )}
      {hints && hints.length > 0 && (
        <ul className="inline-block text-left text-xs text-[var(--text-muted)] space-y-1 mb-4 max-w-sm">
          {hints.map((h, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-[var(--accent)] flex-shrink-0">•</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
}
