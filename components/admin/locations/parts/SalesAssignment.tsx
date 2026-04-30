"use client";

import { useState } from "react";
import { Briefcase, Plus, X } from "lucide-react";
import { Button, Dialog } from "@/components/ui";
import type { Location } from "@/lib/locations";
import { SALES_LIMIT } from "@/lib/services/locations-service";

/** Przypisanie podległych sklepów (do service location). */
export function SalesAssignment({
  salesIds,
  candidates,
  onChange,
}: {
  salesIds: string[];
  candidates: Location[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const assigned = candidates.filter((c) => salesIds.includes(c.id));
  const limitReached = salesIds.length >= SALES_LIMIT;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-[var(--text-muted)]">
          Punkty
        </label>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setOpen(true)}
          leftIcon={<Plus className="w-3 h-3" />}
        >
          Przypisz
        </Button>
      </div>
      {assigned.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)] p-3 rounded-lg border border-dashed border-[var(--border-subtle)] text-center">
          Brak przypisanych punktów. Klik &bdquo;Przypisz&rdquo; aby dodać.
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assigned.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--bg-surface)] text-xs"
            >
              <Briefcase className="w-3 h-3 text-sky-400" />
              {s.name}
              {s.warehouseCode && (
                <span className="text-[10px] text-[var(--text-muted)] font-mono">
                  {s.warehouseCode}
                </span>
              )}
              <button
                type="button"
                onClick={() => onChange(salesIds.filter((id) => id !== s.id))}
                className="text-[var(--text-muted)] hover:text-red-400 ml-0.5"
                aria-label="Usuń"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Przypisz punkty" size="md">
          {limitReached && (
            <div className="text-xs text-amber-400 bg-amber-500/10 rounded-lg p-2.5 mb-3">
              Osiągnięto limit {SALES_LIMIT} punktów. Usuń jakieś żeby dodać kolejne.
            </div>
          )}
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {candidates.map((c) => {
              const checked = salesIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={!checked && limitReached}
                  onClick={() => {
                    if (checked) {
                      onChange(salesIds.filter((id) => id !== c.id));
                    } else if (!limitReached) {
                      onChange([...salesIds, c.id]);
                    }
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition flex items-center gap-3 disabled:opacity-40 ${
                    checked
                      ? "border-[var(--accent)] bg-[var(--accent)]/5"
                      : "border-[var(--border-subtle)] hover:bg-[var(--bg-surface)]"
                  }`}
                >
                  <input type="checkbox" checked={checked} readOnly tabIndex={-1} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{c.name}</div>
                    {c.warehouseCode && (
                      <div className="text-[10px] uppercase font-mono text-[var(--text-muted)]">
                        {c.warehouseCode}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end pt-3 border-t border-[var(--border-subtle)] mt-3">
            <Button onClick={() => setOpen(false)}>
              Gotowe ({salesIds.length})
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
