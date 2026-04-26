"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  items: Crumb[];
  className?: string;
}

/**
 * Breadcrumbs nawigacji — pierwszy element zwykle "Dashboard", ostatni
 * to current page (bez href, podświetlony). Separator chevron right.
 */
export function Breadcrumbs({ items, className }: Props) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Ścieżka nawigacji"
      className={`flex items-center gap-1 text-xs text-[var(--text-muted)] ${className ?? ""}`}
    >
      <Link
        href="/dashboard"
        className="hover:text-[var(--text-main)] flex items-center"
        aria-label="Dashboard"
      >
        <Home className="w-3.5 h-3.5" />
      </Link>
      {items.map((c, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3 text-[var(--text-muted)] opacity-50" />
            {c.href && !isLast ? (
              <Link
                href={c.href}
                className="hover:text-[var(--text-main)]"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className={isLast ? "text-[var(--text-main)] font-medium" : ""}
                aria-current={isLast ? "page" : undefined}
              >
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
