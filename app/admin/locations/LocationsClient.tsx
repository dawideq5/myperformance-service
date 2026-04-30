"use client";

import { useCallback, useMemo, useState } from "react";
import { PageShell, useToast } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { api, ApiRequestError } from "@/lib/api-client";
import type { Location, LocationType } from "@/lib/locations";
import {
  countByType,
  draftToPayload,
  emptyDraft,
  filterLocations,
  locationToDraft,
  type DraftState,
} from "@/lib/services/locations-service";
import { LocationsList } from "@/components/admin/locations/LocationsList";
import { LocationEditor } from "@/components/admin/locations/LocationEditor";

interface LocationsClientProps {
  initial: Location[];
  userLabel?: string;
  userEmail?: string;
}

/**
 * Shell `/admin/locations`. Trzyma state listy + filtra + edytora; deleguje
 * rendering kafelków do `LocationsList`, edycję do `LocationEditor`,
 * a Leaflet mapę do shared `components/LocationMap.tsx` (re-used).
 *
 * Pure helpery (filtr/draft/payload/coord validators/Nominatim wrapper)
 * żyją w `lib/services/locations-service.ts`.
 */
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

  const filtered = useMemo(
    () => filterLocations(locations, filter, query),
    [locations, filter, query],
  );

  const counts = useMemo(() => countByType(locations), [locations]);

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
      const payload = draftToPayload(editing);
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
        <LocationsList
          filtered={filtered}
          filter={filter}
          onFilterChange={setFilter}
          query={query}
          onQueryChange={setQuery}
          counts={counts}
          onAdd={() => setEditing(emptyDraft())}
          onSelect={(l) => setEditing(locationToDraft(l))}
        />

        {editing && (
          <LocationEditor
            draft={editing}
            onChange={setEditing}
            onClose={() => setEditing(null)}
            onSave={onSave}
            onDelete={
              editing.id
                ? () => {
                    const loc = locations.find((l) => l.id === editing.id);
                    if (loc) onDelete(loc);
                    setEditing(null);
                  }
                : undefined
            }
            saving={saving}
            allLocations={locations}
          />
        )}
      </div>
    </PageShell>
  );
}
