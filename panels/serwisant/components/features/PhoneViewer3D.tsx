"use client";

import { PhoneConfigurator3D } from "../visual/PhoneConfigurator3D";

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
}

/**
 * Read-only viewer 3D urządzenia dla panelu serwisanta. Renderuje pełny
 * model GLB z markerami uszkodzeń zaznaczonymi przez sprzedawcę. Wszelka
 * interakcja edycyjna (dodawanie/edycja markerów, oceny, checklisty,
 * nawigacja kroków) jest wyłączona przez prop `readOnly={true}` w
 * `PhoneConfigurator3D` — pozostaje jedynie obrót/zoom kamery oraz
 * przycisk Zamknij.
 *
 * Komponent zachowuje stabilne API (props) — konsumenci nie muszą wiedzieć,
 * że pod spodem renderowany jest pełen konfigurator z trybem viewer.
 */
export function PhoneViewer3D({
  brand,
  brandColorHex,
  damageMarkers,
  additionalNotes,
  onClose,
}: PhoneViewer3DProps) {
  return (
    <PhoneConfigurator3D
      brand={brand || "telefon"}
      brandColorHex={brandColorHex ?? "#0a0a0a"}
      readOnly
      initial={{
        damage_markers: damageMarkers,
        additional_notes: additionalNotes,
      }}
      onCancel={onClose}
      onComplete={onClose}
    />
  );
}
