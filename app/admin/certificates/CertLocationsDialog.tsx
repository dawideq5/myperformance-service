"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, MapPin, Wrench } from "lucide-react";
import { Alert, Button, Dialog, useToast } from "@/components/ui";
import { LocationMap } from "@/components/LocationMap";
import { api, ApiRequestError } from "@/lib/api-client";
import type { Location } from "@/lib/locations";

interface CertLocationsDialogProps {
  certId: string;
  certSubject: string;
  certRoles: string[];
  open: boolean;
  onClose: () => void;
}

/**
 * Modal przypisywania punktów do certyfikatu klienta.
 *
 * Po wystawieniu certu admin wybiera 1 lub więcej punktów (sklepów lub
 * serwisów) z których cert ma działać. Punkty są filtrowane po roli certa:
 *   - cert ma rolę `sprzedawca` → tylko sales locations
 *   - cert ma rolę `serwisant` → tylko service locations
 *   - cert ma `kierowca` → wszystkie (kierowcy obsługują wiele punktów)
 *
 * Po loginie panel launcher decyduje:
 *   - 0 punktów → brak certu / nie przypisany → error
 *   - 1 punkt → auto-redirect na panel?location=ID
 *   - >1 → strona wyboru z mapą
 */
export function CertLocationsDialog({
  certId,
  certSubject,
  certRoles,
  open,
  onClose,
}: CertLocationsDialogProps) {
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const candidates = useMemo(() => {
    // Filtrujemy punkty po rolach certa.
    if (certRoles.includes("sprzedawca") && !certRoles.includes("kierowca")) {
      return allLocations.filter((l) => l.type === "sales");
    }
    if (certRoles.includes("serwisant") && !certRoles.includes("kierowca")) {
      return allLocations.filter((l) => l.type === "service");
    }
    // kierowca / multi-role / unknown — pokazujemy wszystkie aktywne
    return allLocations;
  }, [allLocations, certRoles]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allRes, assignedRes] = await Promise.all([
        api.get<{ locations: Location[] }>("/api/locations"),
        api.get<{ locations: Location[] }>(
          `/api/admin/certificates/${certId}/locations`,
        ),
      ]);
      setAllLocations(allRes.locations);
      setSelectedIds(new Set(assignedRes.locations.map((l) => l.id)));
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się pobrać punktów",
      );
    } finally {
      setLoading(false);
    }
  }, [certId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put<unknown, { locationIds: string[] }>(
        `/api/admin/certificates/${certId}/locations`,
        { locationIds: Array.from(selectedIds) },
      );
      toast.success(
        "Punkty przypisane",
        `${selectedIds.size} ${selectedIds.size === 1 ? "punkt" : "punktów"} dla ${certSubject}`,
      );
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zapisać";
      setError(msg);
      toast.error("Błąd zapisu", msg);
    } finally {
      setSaving(false);
    }
  }, [certId, selectedIds, certSubject, toast, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Punkty dla certyfikatu: ${certSubject}`}
      size="lg"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        {error && <Alert tone="error">{error}</Alert>}

        {loading ? (
          <p className="text-center text-sm text-[var(--text-muted)] py-8">
            Ładowanie punktów…
          </p>
        ) : candidates.length === 0 ? (
          <Alert tone="info">
            Brak dostępnych punktów. Dodaj je w{" "}
            <a href="/admin/locations" className="underline">
              /admin/locations
            </a>
            .
          </Alert>
        ) : (
          <>
            {/* Mapa z markers — kliknij marker żeby toggle assignment */}
            <div style={{ height: 280 }}>
              <LocationMap
                locations={candidates}
                selectedId={
                  selectedIds.size === 1
                    ? Array.from(selectedIds)[0]
                    : undefined
                }
                onSelect={(l) => toggle(l.id)}
                className="h-full"
              />
            </div>

            <div className="text-xs text-[var(--text-muted)]">
              Klik na marker (lub na wiersz poniżej) żeby zaznaczyć /
              odznaczyć punkt. Wybrane: <strong>{selectedIds.size}</strong>
            </div>

            {/* Lista checkbox-style */}
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {candidates.map((l) => {
                const checked = selectedIds.has(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggle(l.id)}
                    className={`w-full text-left p-3 rounded-lg border transition flex items-start gap-3 ${
                      checked
                        ? "border-[var(--accent)] bg-[var(--accent)]/5"
                        : "border-[var(--border-subtle)] hover:bg-[var(--bg-surface)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      className="mt-0.5"
                      tabIndex={-1}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {l.type === "service" ? (
                          <Wrench className="w-3.5 h-3.5 text-rose-400" />
                        ) : (
                          <Briefcase className="w-3.5 h-3.5 text-sky-400" />
                        )}
                        <span className="text-sm font-medium">{l.name}</span>
                        {l.warehouseCode && (
                          <span className="text-[10px] uppercase font-mono text-[var(--text-muted)]">
                            {l.warehouseCode}
                          </span>
                        )}
                      </div>
                      {l.address && (
                        <div className="text-xs text-[var(--text-muted)] flex items-start gap-1.5">
                          <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          {l.address}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2 justify-end pt-4 border-t border-[var(--border-subtle)] mt-4">
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Anuluj
        </Button>
        <Button onClick={onSave} loading={saving}>
          Zapisz ({selectedIds.size})
        </Button>
      </div>
    </Dialog>
  );
}
