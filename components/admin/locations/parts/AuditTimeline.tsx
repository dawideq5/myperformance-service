"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api-client";
import {
  ACTION_LABELS,
  type AuditEntry,
} from "@/lib/services/locations-service";

/** Historia akcji per location (timeline z `/api/admin/locations/[id]/audit`). */
export function AuditTimeline({ locationId }: { locationId: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await api.get<{ entries: AuditEntry[] }>(
          `/api/admin/locations/${locationId}/audit?limit=50`,
        );
        setEntries(r.entries);
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się pobrać historii",
        );
      }
    })();
  }, [locationId]);

  return (
    <div className="pt-4 border-t border-[var(--border-subtle)]">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-[var(--accent)]" />
        <h3 className="text-sm font-semibold">Historia działań</h3>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {entries === null ? (
        <p className="text-xs text-[var(--text-muted)]">Ładowanie…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          Brak zarejestrowanych zdarzeń. Po przypisaniu certyfikatów / wejściach
          do panelu pojawi się tu timeline.
        </p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {entries.map((e) => {
            const meta = ACTION_LABELS[e.actionType] ?? {
              label: e.actionType,
              tone: "text-[var(--text-muted)]",
            };
            return (
              <li
                key={e.id}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-[var(--bg-surface)] transition-colors"
              >
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${meta.tone.replace("text-", "bg-")}`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className={`font-medium ${meta.tone}`}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">
                      {new Date(e.ts).toLocaleString("pl-PL")}
                    </span>
                  </div>
                  <div className="text-[var(--text-muted)] truncate">
                    {e.userEmail ?? e.userId ?? "system"}
                    {e.srcIp ? ` · ${e.srcIp}` : ""}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
