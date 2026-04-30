"use client";

// ────────────────────────────────────────────────────────────────────────────
// Services panel — informacyjny widok paneli mTLS.
//
// mTLS jest WYMUSZANY przez Traefik (clientAuthType: RequireAndVerifyClientCert
// w /data/coolify/proxy/dynamic/mtls.yml). Panele bez certu nie przechodzą
// nawet TLS handshake. UI nie ma toggle — to jest enterprise default.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { Alert, Badge, Card, CardHeader } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";
import type { PanelState } from "@/lib/services/certificates-service";

export function ServicesPanel() {
  const [panels, setPanels] = useState<PanelState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await api.get<{ panels: PanelState[] }>(
          "/api/admin/panels/mtls-state",
        );
        if (!cancelled) setPanels(r.panels);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiRequestError
              ? err.message
              : "Nie udało się pobrać listy paneli",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card padding="md">
      <CardHeader
        icon={<ShieldCheck className="w-6 h-6 text-emerald-500" />}
        iconBgClassName="bg-emerald-500/10"
        title="Panele chronione mTLS"
        description="Każdy panel wymaga certyfikatu klienckiego podpisanego przez wewnętrzną CA. Wymóg jest wymuszony przez Traefik na poziomie TLS handshake — bez certu połączenie zostaje odrzucone, zanim trafi do aplikacji."
      />

      {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Ładowanie…
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {panels.map((p) => (
            <div
              key={p.role}
              className="p-4 rounded-xl border border-emerald-500/30 bg-[var(--bg-surface)]"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[var(--text-main)] truncate">
                    {p.label}
                  </div>
                  <a
                    href={`https://${p.domain}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] truncate block"
                  >
                    {p.domain} ↗
                  </a>
                </div>
                <Badge
                  tone="success"
                  className="flex-shrink-0 whitespace-nowrap inline-flex items-center gap-1"
                >
                  <Lock className="w-3 h-3" aria-hidden="true" />
                  mTLS wymagane
                </Badge>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] font-mono">
                tls.options: {p.tlsOption}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
