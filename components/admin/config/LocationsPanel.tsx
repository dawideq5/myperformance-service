"use client";

import Link from "next/link";
import { Briefcase, ExternalLink, Wrench } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import type { Location } from "@/lib/locations";

/**
 * Skrócony widok punktów (sklepów + serwisów). Pełna edycja żyje pod
 * /admin/locations — tu pokazujemy tylko siatkę z linkami "deep dive".
 */
export function LocationsPanel({ locations }: { locations: Location[] }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          href="/admin/locations"
          className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1"
        >
          Pełne zarządzanie w /admin/locations{" "}
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      {locations.length === 0 ? (
        <Card padding="lg">
          <p className="text-center text-sm text-[var(--text-muted)] py-6">
            Brak punktów. Dodaj pierwsze w{" "}
            <Link
              href="/admin/locations"
              className="text-[var(--accent)] underline"
            >
              /admin/locations
            </Link>
            .
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {locations.map((l) => (
            <Link
              href="/admin/locations"
              key={l.id}
              className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent)]/40 transition block"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  {l.type === "service" ? (
                    <Wrench className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  ) : (
                    <Briefcase className="w-4 h-4 text-sky-400 flex-shrink-0" />
                  )}
                  <span className="text-sm font-semibold truncate">
                    {l.name}
                  </span>
                </div>
                {!l.enabled && <Badge tone="neutral">Wył.</Badge>}
              </div>
              {l.warehouseCode && (
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-mono mb-1">
                  {l.warehouseCode}
                </div>
              )}
              {l.address && (
                <div className="text-xs text-[var(--text-muted)] truncate">
                  {l.address}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
