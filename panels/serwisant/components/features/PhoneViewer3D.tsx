"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneConfigurator3D, type VisualConditionState } from "../visual/PhoneConfigurator3D";

/**
 * Marker uszkodzenia — odwzorowuje kształt z `panels/sprzedawca/components/
 * intake/PhoneConfigurator3D.tsx#DamageMarker`. Trzymamy lokalnie żeby
 * konsumenci panelu serwisanta nie musieli importować typów z innego panelu.
 */
export interface DamageMarker {
  id: string;
  x: number;
  y: number;
  z: number;
  surface?: string;
  description?: string;
}

interface PhoneViewer3DProps {
  brand: string;
  brandColorHex?: string;
  /** Markery uszkodzeń z `mp_services.visual_condition.damage_markers`. */
  damageMarkers: DamageMarker[];
  /** Dodatkowe notatki wizualne (z visual_condition.additional_notes). */
  additionalNotes?: string;
  onClose: () => void;
  /** Wave 20 / Faza 1D — edycja markerów. Gdy `serviceId` przekazane,
   * komponent renderuje przycisk "Edytuj markery" w top bar (toggle).
   * W trybie edit: klik na model dodaje marker, klik na marker w prawym
   * panelu otwiera edytor opisu, klik X usuwa marker. Auto-save (debounced
   * 1.2s) PATCH'uje `/api/relay/services/{serviceId}` z całym
   * `damage_markers` array + `additional_notes`. Backend per-marker
   * diff-loguje dodanie/usunięcie/edycję do mp_service_actions. */
  serviceId?: string;
  /** Callback po zapisie zmian — żeby parent (DiagnozaTab) mógł odświeżyć
   * service ticket bez refetch. */
  onSaved?: (updatedVisualCondition: Record<string, unknown>) => void;
  /** Domyślny tryb. `view` = readOnly (legacy zachowanie). `edit` = od
   * razu otwórz w trybie edycji. Bez tego prop'a komponent startuje w
   * view mode. */
  defaultMode?: "view" | "edit";
}

/**
 * Viewer 3D urządzenia dla panelu serwisanta. Renderuje pełen model GLB z
 * markerami uszkodzeń (visual_condition.damage_markers).
 *
 * Tryby:
 *   - `view` (default) — read-only podgląd, rotation/zoom kamery.
 *   - `edit` — markery edytowalne (klik na model = dodaj marker, klik
 *     marker w sidebar = edytuj/usuń). Auto-save debounced 1.2s.
 *
 * Toggle "Edytuj markery" pojawia się gdy `serviceId` przekazane.
 */
export function PhoneViewer3D({
  brand,
  brandColorHex,
  damageMarkers,
  additionalNotes,
  onClose,
  serviceId,
  onSaved,
  defaultMode = "view",
}: PhoneViewer3DProps) {
  const canEdit = !!serviceId;
  const [mode, setMode] = useState<"view" | "edit">(
    canEdit ? defaultMode : "view",
  );
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>(
    JSON.stringify({
      damage_markers: damageMarkers,
      additional_notes: additionalNotes ?? "",
    }),
  );

  const onCleanup = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => onCleanup(), [onCleanup]);

  const flushSave = useCallback(
    async (state: VisualConditionState) => {
      if (!serviceId) return;
      const payload = {
        damage_markers: state.damage_markers ?? [],
        additional_notes: state.additional_notes ?? "",
      };
      const serialized = JSON.stringify(payload);
      if (serialized === lastSavedRef.current) {
        // Nic się nie zmieniło — brak save.
        setSaveStatus("idle");
        return;
      }
      setSaveStatus("saving");
      try {
        const res = await fetch(`/api/relay/services/${serviceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visualCondition: payload }),
        });
        if (!res.ok) {
          setSaveStatus("error");
          return;
        }
        const json = (await res.json().catch(() => null)) as
          | { service?: { visualCondition?: Record<string, unknown> } }
          | null;
        lastSavedRef.current = serialized;
        setSaveStatus("saved");
        if (json?.service?.visualCondition) {
          onSaved?.(json.service.visualCondition);
        }
      } catch {
        setSaveStatus("error");
      }
    },
    [serviceId, onSaved],
  );

  // Debounced auto-save callback — wywoływany przez PhoneConfigurator3D
  // przy każdej zmianie state (add/remove/edit marker, edit notes).
  const onStateChange = useCallback(
    (state: VisualConditionState) => {
      if (mode !== "edit") return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void flushSave(state);
      }, 1200);
    },
    [mode, flushSave],
  );

  const toggleMode = () => {
    setMode((m) => (m === "view" ? "edit" : "view"));
    setSaveStatus("idle");
  };

  return (
    <div className="relative">
      {/* Edit/View toggle button — overlay na top bar PhoneConfigurator3D.
       * Z-index wyższy niż top bar (2050+). */}
      {canEdit && (
        <button
          type="button"
          onClick={toggleMode}
          className="fixed top-3 right-16 z-[2060] px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
          style={{
            background:
              mode === "edit"
                ? "rgba(34,197,94,0.2)"
                : "rgba(255,255,255,0.08)",
            borderColor:
              mode === "edit"
                ? "rgba(34,197,94,0.6)"
                : "rgba(255,255,255,0.15)",
            color: mode === "edit" ? "#86efac" : "rgba(255,255,255,0.85)",
          }}
          aria-pressed={mode === "edit"}
          title={
            mode === "edit"
              ? "Wyjdź z trybu edycji (zmiany są auto-zapisywane)"
              : "Włącz tryb edycji markerów"
          }
        >
          {mode === "edit" ? "Tryb edycji aktywny" : "Edytuj markery"}
        </button>
      )}
      <PhoneConfigurator3D
        brand={brand || "telefon"}
        brandColorHex={brandColorHex ?? "#0a0a0a"}
        readOnly={mode === "view"}
        singleStep={mode === "edit" ? "damage" : undefined}
        initial={{
          damage_markers: damageMarkers,
          additional_notes: additionalNotes,
        }}
        onCancel={onClose}
        onComplete={onClose}
        onStateChange={mode === "edit" ? onStateChange : undefined}
        saveStatus={mode === "edit" ? saveStatus : undefined}
      />
    </div>
  );
}
