"use client";

import { useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { Card, RelativeTime } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";

interface AuditEntry {
  id: string;
  ts: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  result: "success" | "failure";
}

const ACTION_LABEL: Record<string, string> = {
  "user.assign": "przypisał rolę",
  "user.deprovision": "wyrejestrował usera",
  "kc.sync": "sync KC realm",
  "sync.push": "sync profilu",
  "block.manual": "ręczna blokada IP",
  "block.unblock": "odblokował IP",
  "2fa.verify_success": "2FA OK",
  "2fa.verify_failed": "2FA fail",
};

/**
 * Krótki feed ostatnich aktywności IAM — kompaktowa lista do sidebara
 * albo na dole dashboardu. Pokazuje 10 ostatnich wpisów z iam_audit_log.
 */
export function ActivityFeed({ limit = 10 }: { limit?: number }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await api.get<{ entries: AuditEntry[] }>(
          `/api/admin/iam/audit?limit=${limit}`,
        );
        if (!cancelled) setEntries(r.entries);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiRequestError ? err.message : "Load failed",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [limit]);

  return (
    <Card padding="md">
      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Activity className="w-4 h-4 text-[var(--accent)]" />
        Ostatnia aktywność
      </h4>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…
        </div>
      ) : error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          Brak zarejestrowanych operacji.
        </p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                  e.result === "failure" ? "bg-red-500" : "bg-emerald-500"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  <span className="text-[var(--text-muted)]">{e.actor}</span>
                  {" → "}
                  <span>{ACTION_LABEL[e.action] ?? e.action}</span>
                  {e.targetId && e.targetId !== "global" && (
                    <code className="text-[10px] text-[var(--text-muted)] ml-1">
                      {e.targetId.slice(0, 12)}
                      {e.targetId.length > 12 ? "…" : ""}
                    </code>
                  )}
                </div>
                <RelativeTime
                  date={e.ts}
                  className="text-[10px] text-[var(--text-muted)]"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
