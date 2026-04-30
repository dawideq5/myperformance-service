"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  OnboardingCard,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";
import {
  DNS_ZONES,
  type DnsRecord,
  type DnsZone,
} from "@/lib/services/infrastructure-service";

export function DnsPanel() {
  const [zone, setZone] = useState<DnsZone>("myperformance.pl");
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const { confirm, ConfirmDialogElement } = useConfirm();
  const toast = useToast();

  const load = useCallback(async (z: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{
        records: DnsRecord[];
        total: number;
      }>(`/api/admin/infrastructure/dns?zone=${encodeURIComponent(z)}`);
      setRecords(r.records);
      setTotal(r.total);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(zone);
  }, [zone, load]);

  const filtered = useMemo(() => {
    if (!filter) return records;
    const f = filter.toLowerCase();
    return records.filter(
      (r) =>
        r.subDomain.toLowerCase().includes(f) ||
        r.target.toLowerCase().includes(f) ||
        r.fieldType.toLowerCase().includes(f),
    );
  }, [records, filter]);

  async function deleteRecord(id: number) {
    const rec = records.find((r) => r.id === id);
    const ok = await confirm({
      title: "Usunąć rekord DNS?",
      tone: "danger",
      description: rec
        ? `${rec.fieldType} ${rec.subDomain || "@"} → ${rec.target}`
        : "Rekord zostanie usunięty.",
      consequences: [
        "Zmiana propaguje się w DNS w 1-15 min (zależnie od TTL)",
        rec?.fieldType === "MX"
          ? "Usunięcie MX może przerwać dostarczanie maili z tego subdomenu"
          : null,
        rec?.fieldType === "CNAME" || rec?.fieldType === "A"
          ? "Aplikacja pod tym subdomenem przestanie odpowiadać"
          : null,
        "OVH wykona refresh strefy automatycznie",
      ].filter(Boolean) as React.ReactNode[],
      confirmLabel: "Usuń rekord",
    });
    if (!ok) return;
    try {
      await api.delete(
        `/api/admin/infrastructure/dns?zone=${encodeURIComponent(zone)}&id=${id}`,
      );
      toast.success("Rekord DNS usunięty", "OVH refreshuje strefę w 1-15 min");
      await load(zone);
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : "Delete failed";
      toast.error("Nie udało się usunąć", msg);
      setError(msg);
    }
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <CardHeader
          icon={<Globe className="w-6 h-6 text-[var(--accent)]" />}
          title="DNS Zone — zarządzanie rekordami"
          description="Pełna kontrola nad strefą DNS przez OVH API. Dodawanie/usuwanie rekordów, auto-refresh strefy po zmianie. Automatyczne dodawanie SPF/DKIM/CNAME dla nowych usług."
        />
        <OnboardingCard
          storageKey="dns-panel"
          title="Edycja DNS — uważaj na propagację"
        >
          Każda zmiana propaguje się przez TTL danego rekordu. Najczęściej
          1-15 min, ale na DNS resolverach klienta może wisieć dłużej.
          Usunięcie <strong>MX</strong> przerywa email, usunięcie A/CNAME
          wyłącza aplikację pod tym subdomenem. OVH refreshuje strefę
          automatycznie po naszym DELETE.
        </OnboardingCard>
        <div className="mt-4 flex gap-2">
          <select
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
            value={zone}
            onChange={(e) => setZone(e.target.value as DnsZone)}
          >
            {DNS_ZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
            placeholder="Filtruj po subdomain / target / type…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Pobieram strefę…
        </div>
      )}

      <Card padding="md">
        <div className="text-[11px] text-[var(--text-muted)] mb-2">
          {filtered.length} z {total} rekord(ów)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                <th className="py-2 px-2">Type</th>
                <th className="py-2 px-2">Subdomain</th>
                <th className="py-2 px-2">Target</th>
                <th className="py-2 px-2">TTL</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--border-subtle)]/50"
                >
                  <td className="py-1.5 px-2">
                    <Badge tone="neutral">{r.fieldType}</Badge>
                  </td>
                  <td className="py-1.5 px-2 font-mono">
                    {r.subDomain || <span className="opacity-60">@</span>}
                  </td>
                  <td className="py-1.5 px-2 font-mono break-all max-w-[400px]">
                    {r.target}
                  </td>
                  <td className="py-1.5 px-2 text-[var(--text-muted)]">
                    {r.ttl}s
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <button
                      type="button"
                      onClick={() => deleteRecord(r.id)}
                      className="text-[10px] text-red-400 hover:underline"
                    >
                      usuń
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {ConfirmDialogElement}
    </div>
  );
}
