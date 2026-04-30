"use client";

import { Briefcase, Trash2, Wrench } from "lucide-react";
import { Button, Dialog, Input } from "@/components/ui";
import { LocationMap } from "@/components/LocationMap";
import type { Location } from "@/lib/locations";
import {
  DAY_LABELS,
  type DraftState,
} from "@/lib/services/locations-service";
import { LocationGeocoding } from "./LocationGeocoding";
import { PhoneField } from "./parts/PhoneField";
import { PhotosUpload } from "./parts/PhotosUpload";
import { SalesAssignment } from "./parts/SalesAssignment";
import { AuditTimeline } from "./parts/AuditTimeline";

/**
 * Dialog edycji / tworzenia punktu. Composite komponent — sekcje:
 *   - podstawowe (nazwa, kod, typ)
 *   - adres + autocomplete + draggable pin (LocationGeocoding + LocationMap)
 *   - kontakt (email + phone z prefixem; `parts/PhoneField`)
 *   - opis
 *   - godziny otwarcia
 *   - upload zdjęć (`parts/PhotosUpload`, do 3, Directus folder "locations")
 *   - plan budżetu dziennego
 *   - relacja sales↔service (`parts/SalesAssignment`)
 *   - enabled toggle
 *   - audit timeline (`parts/AuditTimeline`, tylko dla istniejących)
 */
export function LocationEditor({
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
        <LocationGeocoding
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
          <PhoneField value={draft.phone} onChange={(v) => set("phone", v)} />
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
