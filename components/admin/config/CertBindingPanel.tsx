"use client";

import { useMemo, useState } from "react";
import {
  Briefcase,
  FileSignature,
  Link2Off,
  LinkIcon,
  Wrench,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import type { CertLinkRow } from "@/lib/config-overview";
import { CertLocationsDialog } from "@/app/admin/certificates/CertLocationsDialog";

/**
 * Mapa cert ↔ punkt: filtruje po stanie (wszystkie / z powiązaniami / bez)
 * i otwiera dialog edycji powiązań. Po zamknięciu dialogu — page reload, bo
 * server-side stats nie wracają z dialogu i najprościej pełne odświeżenie.
 */
export function CertBindingPanel({ links }: { links: CertLinkRow[] }) {
  const [editingCert, setEditingCert] = useState<CertLinkRow | null>(null);
  const [filter, setFilter] = useState<"all" | "linked" | "unlinked">("all");

  const filtered = useMemo(() => {
    return links.filter((l) => {
      if (l.revoked) return false;
      if (filter === "linked") return l.locations.length > 0;
      if (filter === "unlinked") return l.locations.length === 0;
      return true;
    });
  }, [links, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            filter === "all"
              ? "bg-[var(--accent)]/10 text-[var(--accent)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
          }`}
        >
          Wszystkie ({links.filter((l) => !l.revoked).length})
        </button>
        <button
          onClick={() => setFilter("linked")}
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            filter === "linked"
              ? "bg-emerald-500/10 text-emerald-400"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
          }`}
        >
          Z powiązaniami (
          {links.filter((l) => !l.revoked && l.locations.length > 0).length})
        </button>
        <button
          onClick={() => setFilter("unlinked")}
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            filter === "unlinked"
              ? "bg-rose-500/10 text-rose-400"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
          }`}
        >
          Bez powiązań (
          {links.filter((l) => !l.revoked && l.locations.length === 0).length})
        </button>
      </div>

      {filtered.length === 0 ? (
        <Card padding="lg">
          <p className="text-center text-sm text-[var(--text-muted)] py-6">
            Brak certyfikatów spełniających filtr.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <div
              key={row.certId}
              className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <FileSignature className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                    <span className="font-semibold truncate">
                      {row.certSubject}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] flex flex-wrap gap-3">
                    {row.certEmail && <span>{row.certEmail}</span>}
                    {row.certRoles.map((r) => (
                      <Badge key={r} tone="neutral">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<LinkIcon className="w-3.5 h-3.5" />}
                  onClick={() => setEditingCert(row)}
                >
                  {row.locations.length === 0 ? "Powiąż punkty" : "Edytuj"}
                </Button>
              </div>
              {row.locations.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/5 rounded-lg p-2.5">
                  <Link2Off className="w-3.5 h-3.5" />
                  Brak przypisanych punktów. User z tym cert dostanie
                  &bdquo;Brak przypisanych punktów&rdquo; przy logowaniu do
                  panelu.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {row.locations.map((l) => (
                    <span
                      key={l.id}
                      className="text-xs px-2 py-1 rounded bg-[var(--bg-surface)] flex items-center gap-1.5"
                    >
                      {l.type === "service" ? (
                        <Wrench className="w-3 h-3 text-rose-400" />
                      ) : (
                        <Briefcase className="w-3 h-3 text-sky-400" />
                      )}
                      {l.name}
                      {l.warehouseCode && (
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                          {l.warehouseCode}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editingCert && (
        <CertLocationsDialog
          open
          certId={editingCert.certId}
          certSubject={editingCert.certSubject}
          certRoles={editingCert.certRoles}
          onClose={() => {
            setEditingCert(null);
            // Force refresh — najprościej window.location.reload
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
