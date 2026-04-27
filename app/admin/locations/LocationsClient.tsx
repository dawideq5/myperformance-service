"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Briefcase,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  Input,
  PageShell,
  useToast,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { LocationMap } from "@/components/LocationMap";
import { api, ApiRequestError } from "@/lib/api-client";
import type { Location, LocationHours, LocationType } from "@/lib/locations";

interface LocationsClientProps {
  initial: Location[];
  userLabel?: string;
  userEmail?: string;
}

const DAY_LABELS: Record<keyof Omit<LocationHours, "sundays_handlowe">, string> = {
  mon: "Poniedziałek",
  tue: "Wtorek",
  wed: "Środa",
  thu: "Czwartek",
  fri: "Piątek",
  sat: "Sobota",
  sun: "Niedziela",
};

const EMPTY_HOURS: LocationHours = {
  mon: "09-17",
  tue: "09-17",
  wed: "09-17",
  thu: "09-17",
  fri: "09-17",
  sat: "10-14",
  sun: null,
  sundays_handlowe: [],
};

interface DraftState {
  id?: string;
  name: string;
  warehouseCode: string;
  type: LocationType;
  address: string;
  lat: number | null;
  lng: number | null;
  description: string;
  email: string;
  phone: string;
  hours: LocationHours;
  photos: string[];
  budgetPlan: string;
  serviceId: string;
  salesIds: string[];
  enabled: boolean;
}

function locationToDraft(l: Location): DraftState {
  return {
    id: l.id,
    name: l.name,
    warehouseCode: l.warehouseCode ?? "",
    type: l.type,
    address: l.address ?? "",
    lat: l.lat,
    lng: l.lng,
    description: l.description ?? "",
    email: l.email ?? "",
    phone: l.phone ?? "",
    hours: l.hours ?? EMPTY_HOURS,
    photos: l.photos,
    budgetPlan: l.budgetPlan != null ? String(l.budgetPlan) : "",
    serviceId: l.serviceId ?? "",
    salesIds: l.salesIds,
    enabled: l.enabled,
  };
}

function emptyDraft(): DraftState {
  return {
    name: "",
    warehouseCode: "",
    type: "sales",
    address: "",
    lat: null,
    lng: null,
    description: "",
    email: "",
    phone: "",
    hours: EMPTY_HOURS,
    photos: [],
    budgetPlan: "",
    serviceId: "",
    salesIds: [],
    enabled: true,
  };
}

export function LocationsClient({
  initial,
  userLabel,
  userEmail,
}: LocationsClientProps) {
  const [locations, setLocations] = useState<Location[]>(initial);
  const [filter, setFilter] = useState<"all" | LocationType>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return locations
      .filter((l) => filter === "all" || l.type === filter)
      .filter((l) => {
        if (!q) return true;
        return (
          l.name.toLowerCase().includes(q) ||
          (l.warehouseCode ?? "").toLowerCase().includes(q) ||
          (l.address ?? "").toLowerCase().includes(q)
        );
      });
  }, [locations, filter, query]);

  const counts = useMemo(
    () => ({
      all: locations.length,
      sales: locations.filter((l) => l.type === "sales").length,
      service: locations.filter((l) => l.type === "service").length,
    }),
    [locations],
  );

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ locations: Location[] }>(
        "/api/locations?all=1",
      );
      setLocations(r.locations);
    } catch {
      // ignore
    }
  }, []);

  const onSave = useCallback(async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const payload = {
        name: editing.name,
        warehouseCode: editing.warehouseCode || null,
        type: editing.type,
        address: editing.address || null,
        lat: editing.lat,
        lng: editing.lng,
        description: editing.description || null,
        email: editing.email || null,
        phone: editing.phone || null,
        hours: editing.hours,
        photos: editing.photos.filter((p) => p.trim().length > 0).slice(0, 3),
        budgetPlan: editing.budgetPlan ? Number(editing.budgetPlan) : null,
        serviceId:
          editing.type === "sales" ? editing.serviceId || null : null,
        salesIds:
          editing.type === "service"
            ? editing.salesIds.filter(Boolean)
            : [],
        enabled: editing.enabled,
      };
      if (editing.id) {
        await api.put<unknown, typeof payload>(
          `/api/locations/${editing.id}`,
          payload,
        );
        toast.success("Punkt zaktualizowany", editing.name);
      } else {
        await api.post<unknown, typeof payload>("/api/locations", payload);
        toast.success("Punkt utworzony", editing.name);
      }
      setEditing(null);
      await refresh();
    } catch (err) {
      const msg =
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zapisać.";
      toast.error("Błąd zapisu", msg);
    } finally {
      setSaving(false);
    }
  }, [editing, refresh, toast]);

  const onDelete = useCallback(
    async (loc: Location) => {
      if (!window.confirm(`Usunąć punkt „${loc.name}"? Akcji nie można cofnąć.`))
        return;
      try {
        await api.delete<unknown>(`/api/locations/${loc.id}`);
        toast.success("Punkt usunięty");
        await refresh();
      } catch (err) {
        const msg =
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się usunąć.";
        toast.error("Błąd", msg);
      }
    },
    [refresh, toast],
  );

  return (
    <PageShell
      maxWidth="2xl"
      header={
        <AppHeader
          userLabel={userLabel}
          userSubLabel={userEmail}
          backHref="/dashboard"
          title="Punkty (sklepy / serwisy)"
        />
      }
    >
      <div className="space-y-4">
        {/* Header z filtrami i akcją */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filter === "all"
                  ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
              }`}
            >
              Wszystkie ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setFilter("sales")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                filter === "sales"
                  ? "bg-sky-500/10 text-sky-400"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" /> Sprzedaży ({counts.sales})
            </button>
            <button
              type="button"
              onClick={() => setFilter("service")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                filter === "service"
                  ? "bg-rose-500/10 text-rose-400"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
              }`}
            >
              <Wrench className="w-3.5 h-3.5" /> Serwisowe ({counts.service})
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Szukaj…"
                className="pl-9 pr-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm w-full sm:w-56"
              />
            </div>
            <Button
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setEditing(emptyDraft())}
            >
              Dodaj punkt
            </Button>
          </div>
        </div>

        {/* Mapa wszystkich punktów */}
        <Card padding="none" className="overflow-hidden">
          <div style={{ height: 400 }}>
            <LocationMap
              locations={filtered}
              onSelect={(l) => setEditing(locationToDraft(l))}
              className="h-full"
            />
          </div>
        </Card>

        {/* Lista */}
        {filtered.length === 0 ? (
          <Card padding="lg">
            <p className="text-center text-sm text-[var(--text-muted)]">
              Brak punktów. Kliknij „Dodaj punkt&rdquo; aby utworzyć pierwszy.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((l) => (
              <button
                type="button"
                key={l.id}
                onClick={() => setEditing(locationToDraft(l))}
                className="text-left p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent)]/40 transition"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {l.type === "service" ? (
                      <Wrench className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Briefcase className="w-4 h-4 text-sky-400" />
                    )}
                    <span className="text-sm font-semibold">{l.name}</span>
                  </div>
                  {!l.enabled && <Badge tone="neutral">Wyłączony</Badge>}
                </div>
                {l.warehouseCode && (
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-mono mb-1">
                    {l.warehouseCode}
                  </div>
                )}
                {l.address && (
                  <div className="text-xs text-[var(--text-muted)] flex items-start gap-1.5 mb-1">
                    <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {l.address}
                  </div>
                )}
                {l.phone && (
                  <div className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                    <Phone className="w-3 h-3" />
                    {l.phone}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {editing && (
          <EditDialog
            draft={editing}
            onChange={setEditing}
            onClose={() => setEditing(null)}
            onSave={onSave}
            onDelete={editing.id ? () => {
              const loc = locations.find((l) => l.id === editing.id);
              if (loc) onDelete(loc);
              setEditing(null);
            } : undefined}
            saving={saving}
            allLocations={locations}
          />
        )}
      </div>
    </PageShell>
  );
}

function EditDialog({
  draft,
  onChange,
  onClose,
  onSave,
  onDelete,
  saving,
  allLocations,
}: {
  draft: DraftState;
  onChange: (d: DraftState) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  saving: boolean;
  allLocations: Location[];
}) {
  const isEdit = Boolean(draft.id);
  const set = <K extends keyof DraftState>(k: K, v: DraftState[K]) =>
    onChange({ ...draft, [k]: v });

  // Punkty do przypisania (sales→service: lista serwisów; service→sales:
  // lista sklepów). Wykluczamy siebie z listy.
  const candidateServices = allLocations.filter(
    (l) => l.type === "service" && l.id !== draft.id,
  );
  const candidateSales = allLocations.filter(
    (l) => l.type === "sales" && l.id !== draft.id,
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edytuj: ${draft.name || "punkt"}` : "Nowy punkt"}
      size="lg"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Podstawowe */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Nazwa *"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Pełna nazwa punktu"
          />
          <Input
            label="Kod magazynu"
            value={draft.warehouseCode}
            onChange={(e) => set("warehouseCode", e.target.value)}
            placeholder="TS / GKU / SC1 …"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
            Rodzaj punktu *
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => set("type", "sales")}
              className={`flex-1 p-3 rounded-lg border transition flex items-center gap-2 ${
                draft.type === "sales"
                  ? "border-sky-500 bg-sky-500/10 text-sky-300"
                  : "border-[var(--border-subtle)] hover:bg-[var(--bg-surface)]"
              }`}
            >
              <Briefcase className="w-4 h-4" />
              Sprzedaży
            </button>
            <button
              type="button"
              onClick={() => set("type", "service")}
              className={`flex-1 p-3 rounded-lg border transition flex items-center gap-2 ${
                draft.type === "service"
                  ? "border-rose-500 bg-rose-500/10 text-rose-300"
                  : "border-[var(--border-subtle)] hover:bg-[var(--bg-surface)]"
              }`}
            >
              <Wrench className="w-4 h-4" />
              Serwisowy
            </button>
          </div>
        </div>

        {/* Adres + GPS + drag pin na mapie */}
        <Input
          label="Adres"
          value={draft.address}
          onChange={(e) => set("address", e.target.value)}
          placeholder="ul., numer, kod, miasto"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Latitude"
            type="number"
            step="0.0000001"
            value={draft.lat ?? ""}
            onChange={(e) =>
              set("lat", e.target.value === "" ? null : Number(e.target.value))
            }
            placeholder="52.2297"
          />
          <Input
            label="Longitude"
            type="number"
            step="0.0000001"
            value={draft.lng ?? ""}
            onChange={(e) =>
              set("lng", e.target.value === "" ? null : Number(e.target.value))
            }
            placeholder="21.0122"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
            Pinezka na mapie (przeciągnij aby ustawić GPS)
          </label>
          <div style={{ height: 280 }}>
            <LocationMap
              locations={[]}
              editPin={
                draft.lat != null && draft.lng != null
                  ? { lat: draft.lat, lng: draft.lng }
                  : { lat: 52.2297, lng: 21.0122 }
              }
              onPinDrag={(latLng) => {
                onChange({ ...draft, lat: latLng.lat, lng: latLng.lng });
              }}
              className="h-full"
            />
          </div>
        </div>

        {/* Kontakt */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Email"
            type="email"
            value={draft.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="punkt@firma.pl"
          />
          <Input
            label="Telefon"
            value={draft.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+48 …"
          />
        </div>

        {/* Opis */}
        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
            Opis (np. obok wejścia do galerii)
          </label>
          <textarea
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            rows={2}
            className="w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] px-3 py-2 text-sm"
            placeholder="Szczegóły lokalizacji w budynku, parter / piętro, lokal nr…"
          />
        </div>

        {/* Godziny otwarcia */}
        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
            Godziny otwarcia (format: 09-17, lub puste dla zamknięte)
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(DAY_LABELS) as Array<keyof typeof DAY_LABELS>).map(
              (d) => (
                <div key={d}>
                  <span className="text-[10px] uppercase text-[var(--text-muted)]">
                    {DAY_LABELS[d].slice(0, 3)}
                  </span>
                  <input
                    type="text"
                    value={draft.hours[d] ?? ""}
                    onChange={(e) =>
                      set("hours", {
                        ...draft.hours,
                        [d]: e.target.value || null,
                      })
                    }
                    placeholder="09-17"
                    className="w-full rounded-md bg-[var(--bg-card)] border border-[var(--border-subtle)] px-2 py-1 text-xs"
                  />
                </div>
              ),
            )}
          </div>
          <div className="mt-2">
            <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">
              Niedziele handlowe (CSV YYYY-MM-DD)
            </label>
            <input
              type="text"
              value={(draft.hours.sundays_handlowe ?? []).join(",")}
              onChange={(e) =>
                set("hours", {
                  ...draft.hours,
                  sundays_handlowe: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="2026-12-21,2027-04-12"
              className="w-full rounded-md bg-[var(--bg-card)] border border-[var(--border-subtle)] px-2 py-1 text-xs font-mono"
            />
          </div>
        </div>

        {/* Zdjęcia (max 3 URL) */}
        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
            Zdjęcia (max 3 URL-e — np. wgrane w Directus / Outline / dowolny CDN)
          </label>
          <div className="space-y-2">
            {[0, 1, 2].map((idx) => (
              <input
                key={idx}
                type="url"
                value={draft.photos[idx] ?? ""}
                onChange={(e) => {
                  const next = [...draft.photos];
                  next[idx] = e.target.value;
                  set("photos", next.filter((_, i) => i <= idx || next[i]));
                }}
                placeholder={`https://… (zdjęcie ${idx + 1})`}
                className="w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] px-3 py-2 text-xs font-mono"
              />
            ))}
          </div>
        </div>

        {/* Plan budżetu */}
        <Input
          label="Plan realizacji budżetu (PLN)"
          type="number"
          value={draft.budgetPlan}
          onChange={(e) => set("budgetPlan", e.target.value)}
          placeholder="np. 250000"
        />

        {/* Relacje sales↔service */}
        {draft.type === "sales" && (
          <div>
            <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
              Przypisany serwis (max 1)
            </label>
            <select
              value={draft.serviceId}
              onChange={(e) => set("serviceId", e.target.value)}
              className="w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] px-3 py-2 text-sm"
            >
              <option value="">— bez przypisania —</option>
              {candidateServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.warehouseCode ? ` (${s.warehouseCode})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {draft.type === "service" && candidateSales.length > 0 && (
          <div>
            <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
              Podległe punkty sprzedaży (Cmd/Ctrl-klik dla wielu)
            </label>
            <select
              multiple
              value={draft.salesIds}
              onChange={(e) =>
                set(
                  "salesIds",
                  Array.from(e.target.selectedOptions).map((o) => o.value),
                )
              }
              className="w-full rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] px-3 py-2 text-sm min-h-[120px]"
            >
              {candidateSales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.warehouseCode ? ` (${s.warehouseCode})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Enabled */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
          />
          Aktywny w systemie (widoczny userom)
        </label>

        {/* Historia (tylko dla istniejącego punktu) */}
        {isEdit && draft.id && <AuditTimeline locationId={draft.id} />}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-[var(--border-subtle)] mt-4">
        {onDelete && (
          <Button
            variant="ghost"
            onClick={onDelete}
            leftIcon={<Trash2 className="w-4 h-4" />}
            className="text-red-400 hover:text-red-300"
          >
            Usuń
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Anuluj
          </Button>
          <Button onClick={onSave} loading={saving} disabled={!draft.name.trim()}>
            {isEdit ? "Zapisz" : "Utwórz"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

interface AuditEntry {
  id: number;
  locationId: string;
  userId: string | null;
  userEmail: string | null;
  actionType: string;
  payload: Record<string, unknown> | null;
  srcIp: string | null;
  ts: string;
}

const ACTION_LABELS: Record<string, { label: string; tone: string }> = {
  "panel.entered": { label: "Wejście do panelu", tone: "text-sky-400" },
  "panel.location.selected": {
    label: "Wybór punktu",
    tone: "text-sky-400",
  },
  "panel.exited": { label: "Wyjście z panelu", tone: "text-[var(--text-muted)]" },
  "details.updated": { label: "Edycja danych", tone: "text-amber-400" },
  "details.created": { label: "Utworzenie punktu", tone: "text-emerald-400" },
  "details.deleted": { label: "Usunięcie punktu", tone: "text-red-400" },
  "cert.assigned": { label: "Przypisano certyfikat", tone: "text-emerald-400" },
  "cert.unassigned": { label: "Cofnięto certyfikat", tone: "text-rose-400" },
};

function AuditTimeline({ locationId }: { locationId: string }) {
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
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
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
