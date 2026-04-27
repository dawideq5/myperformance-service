"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Activity,
  Briefcase,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
  Wrench,
  X,
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
  mon: "09-21",
  tue: "09-21",
  wed: "09-21",
  thu: "09-21",
  fri: "09-21",
  sat: "09-21",
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

        {/* Adres + autocomplete + drag pin na mapie */}
        <AddressAutocomplete
          value={draft.address}
          onAddressChange={(v) => set("address", v)}
          onSelect={(r) =>
            onChange({
              ...draft,
              address: r.displayName,
              lat: r.lat,
              lng: r.lng,
            })
          }
        />
        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
            Pinezka na mapie (przeciągnij aby ustawić)
            {draft.lat != null && draft.lng != null && (
              <span className="ml-2 font-mono text-[10px]">
                {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
              </span>
            )}
          </label>
          <div style={{ height: 320 }}>
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
          <PhoneField
            value={draft.phone}
            onChange={(v) => set("phone", v)}
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

        {/* Zdjęcia — upload do Directus folder "locations" */}
        <PhotosUpload
          photos={draft.photos}
          onChange={(p) => set("photos", p)}
        />

        {/* Plan budżetu (DZIENNY) */}
        <Input
          label="Plan realizacji dziennego budżetu (PLN)"
          type="number"
          value={draft.budgetPlan}
          onChange={(e) => set("budgetPlan", e.target.value)}
          placeholder="np. 8500"
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
          <SalesAssignment
            salesIds={draft.salesIds}
            candidates={candidateSales}
            onChange={(ids) => set("salesIds", ids)}
          />
        )}

        {/* Enabled */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
          />
          Widoczny dla użytkowników
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

// ── Telefon z country code dropdown ──────────────────────────────────────
const PHONE_PREFIXES = [
  { code: "+48", label: "🇵🇱 PL" },
  { code: "+49", label: "🇩🇪 DE" },
  { code: "+44", label: "🇬🇧 UK" },
  { code: "+1", label: "🇺🇸 US" },
  { code: "+33", label: "🇫🇷 FR" },
  { code: "+39", label: "🇮🇹 IT" },
  { code: "+34", label: "🇪🇸 ES" },
  { code: "+420", label: "🇨🇿 CZ" },
  { code: "+421", label: "🇸🇰 SK" },
  { code: "+380", label: "🇺🇦 UA" },
];

function splitPhone(value: string): { prefix: string; rest: string } {
  const trimmed = value.trim();
  for (const p of PHONE_PREFIXES) {
    if (trimmed.startsWith(p.code)) {
      return { prefix: p.code, rest: trimmed.slice(p.code.length).trim() };
    }
  }
  return { prefix: "+48", rest: trimmed.replace(/^\+\d+\s*/, "") };
}

function PhoneField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { prefix, rest } = splitPhone(value);

  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
        Telefon
      </label>
      <div className="flex gap-2">
        <select
          value={prefix}
          onChange={(e) => {
            const newPrefix = e.target.value;
            onChange(rest ? `${newPrefix} ${rest}` : newPrefix);
          }}
          className="rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] px-2 py-2 text-sm font-mono w-24"
        >
          {PHONE_PREFIXES.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label} {p.code}
            </option>
          ))}
        </select>
        <input
          type="tel"
          value={rest}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9 -]/g, "");
            onChange(v ? `${prefix} ${v}` : prefix);
          }}
          placeholder="500 100 200"
          className="flex-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}

// ── Photos upload (Directus folder "locations") ─────────────────────────
const MAX_PHOTOS = 3;

function PhotosUpload({
  photos,
  onChange,
}: {
  photos: string[];
  onChange: (p: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const remaining = MAX_PHOTOS - photos.length;

  const onFile = useCallback(
    async (file: File) => {
      if (photos.length >= MAX_PHOTOS) {
        setError(`Osiągnięto limit ${MAX_PHOTOS} zdjęć`);
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("filename", file.name);
        const res = await fetch("/api/locations/upload", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body?.error?.message ?? `HTTP ${res.status}`,
          );
        }
        const data = (await res.json()) as { data: { url: string } };
        onChange([...photos, data.data.url].slice(0, MAX_PHOTOS));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload nieudany");
      } finally {
        setUploading(false);
      }
    },
    [photos, onChange],
  );

  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
        Zdjęcia (max {MAX_PHOTOS}) — wgraj plik z dysku, zostanie zapisany w
        Directus
      </label>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((url, idx) => (
          <div
            key={idx}
            className="relative aspect-square rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Zdjęcie ${idx + 1}`}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, i) => i !== idx))}
              className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white hover:bg-red-500/80 transition"
              aria-label="Usuń zdjęcie"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {remaining > 0 && (
          <>
            {/* htmlFor + sr-only input — natywny mechanizm browser otwierający
                file picker. Programmatic ref.click() na hidden input bywał
                blokowany przez niektóre browsery (Safari, Firefox z user gesture
                requirements). Label z htmlFor jest niezawodny. */}
            <label
              htmlFor={inputId}
              className={`aspect-square rounded-lg border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--accent)]/50 flex flex-col items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] transition cursor-pointer ${
                uploading ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              {uploading ? (
                <>
                  <Activity className="w-5 h-5 animate-spin" />
                  <span className="text-[10px] mt-1">Wgrywanie…</span>
                </>
              ) : (
                <>
                  <Plus className="w-6 h-6" />
                  <span className="text-[10px] mt-1">Wgraj zdjęcie</span>
                </>
              )}
            </label>
            <input
              id={inputId}
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = ""; // reset żeby ten sam plik dało się wgrać ponownie
              }}
            />
          </>
        )}
      </div>
      {error && (
        <p className="text-[11px] text-red-400 mt-1.5">{error}</p>
      )}
    </div>
  );
}

// ── Adres autocomplete (Nominatim OSM) ──────────────────────────────────
interface NominatimResult {
  displayName: string;
  lat: number;
  lng: number;
}

function AddressAutocomplete({
  value,
  onAddressChange,
  onSelect,
}: {
  value: string;
  onAddressChange: (v: string) => void;
  onSelect: (r: NominatimResult) => void;
}) {
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value || value.length < 4) {
      setResults([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", value);
        url.searchParams.set("format", "json");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("countrycodes", "pl");
        url.searchParams.set("limit", "6");
        url.searchParams.set("accept-language", "pl");
        const res = await fetch(url.toString(), {
          headers: { "Accept-Language": "pl" },
        });
        if (res.ok) {
          const data = (await res.json()) as Array<{
            display_name: string;
            lat: string;
            lon: string;
          }>;
          setResults(
            data.map((r) => ({
              displayName: r.display_name,
              lat: Number(r.lat),
              lng: Number(r.lon),
            })),
          );
          setOpen(true);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value]);

  // Click outside zamyka dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Input
        label="Adres"
        value={value}
        onChange={(e) => onAddressChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Zacznij wpisywać ulicę / miasto…"
      />
      {loading && (
        <span className="absolute right-3 top-9 text-[10px] text-[var(--text-muted)]">
          szukanie…
        </span>
      )}
      {open && results.length > 0 && (
        <ul
          className="absolute z-50 mt-1 w-full rounded-lg border bg-[var(--bg-card)] shadow-2xl max-h-64 overflow-auto animate-fade-in"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onSelect(r);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-[var(--bg-surface)] text-xs"
              >
                {r.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Przypisanie podległych sklepów (do service location) ─────────────────
const SALES_LIMIT = 50;

function SalesAssignment({
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
