"use client";

import { useState } from "react";
import { Box, ChevronDown, Eye, X } from "lucide-react";

/**
 * Marker uszkodzenia — odwzorowuje kształt z `panels/sprzedawca/components/
 * intake/PhoneConfigurator3D.tsx#DamageMarker`. Trzymamy lokalnie żeby panel
 * serwisanta mógł kompilować się BEZ zależności three / @react-three/fiber.
 */
export interface DamageMarker {
  id: string;
  x: number;
  y: number;
  z: number;
  surface?: string;
  description?: string;
}

const SURFACE_LABELS: Record<string, string> = {
  display: "Wyświetlacz",
  back: "Panel tylny",
  cameras: "Wyspa aparatów",
  frames: "Ramki boczne",
  earpiece: "Głośnik rozmów",
  speakers: "Głośniczki dolne",
  port: "Port ładowania",
  frame: "Ramka",
};

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
 * Thin wrapper / shim dla widoku 3D urządzenia w panelu serwisanta.
 *
 * **Phase 2C status:** używamy fallback-renderera z listą markerów
 * uszkodzeń. Pełny `PhoneConfigurator3D` (sprzedawca/components/intake)
 * z `readOnly={true}` zostanie podpięty w Phase 3 — wymaga przeniesienia
 * komponentu 3D do współdzielonego paczki lub dodania zależności
 * `three / @react-three/fiber / @react-three/drei` do panelu serwisanta
 * (obecnie panel jest świadomie ich pozbawiony żeby trzymać bundle
 * lekki). Modyfikacja `PhoneConfigurator3D` o prop `readOnly` została
 * już wykonana w Phase 2C — wystarczy dodać deps i swap fallback na
 * `<PhoneConfigurator3D readOnly … />`.
 *
 * Ten komponent zachowuje stabilne API (props) tak żeby Phase 3 mogło
 * podmienić render bez zmian po stronie konsumentów.
 */
export function PhoneViewer3D({
  brand,
  brandColorHex,
  damageMarkers,
  additionalNotes,
  onClose,
}: PhoneViewer3DProps) {
  const [expandedMarker, setExpandedMarker] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-[2050] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-viewer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] rounded-2xl border overflow-hidden flex flex-col"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
            <h2 id="phone-viewer-title" className="text-base font-semibold">
              Podgląd urządzenia — {brand || "telefon"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg"
            style={{ color: "var(--text-muted)" }}
            aria-label="Zamknij podgląd"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Lightweight visual placeholder — gradient + brand color tła */}
          <div
            className="rounded-2xl border flex items-center justify-center min-h-[260px] relative overflow-hidden"
            style={{
              borderColor: "var(--border-subtle)",
              background: brandColorHex
                ? `radial-gradient(circle at 30% 30%, ${brandColorHex}33, var(--bg-surface) 70%)`
                : "var(--bg-surface)",
            }}
            aria-hidden
          >
            <Box
              className="w-16 h-16"
              style={{ color: "var(--text-muted)", opacity: 0.4 }}
            />
            <p
              className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-wider px-2 py-0.5 rounded"
              style={{
                background: "var(--bg-card)",
                color: "var(--text-muted)",
              }}
            >
              Podgląd 3D — dostępny po integracji Phase 3
            </p>
          </div>

          <section
            className="rounded-2xl border"
            style={{ borderColor: "var(--border-subtle)" }}
            aria-label="Markery uszkodzeń"
          >
            <div
              className="px-4 py-2.5 border-b text-[11px] uppercase tracking-wider font-semibold"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              Markery uszkodzeń ({damageMarkers.length})
            </div>
            {damageMarkers.length === 0 ? (
              <p
                className="px-4 py-3 text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                Sprzedawca nie zaznaczył żadnych markerów uszkodzeń.
              </p>
            ) : (
              <ul role="list" className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {damageMarkers.map((m, idx) => {
                  const surfaceLabel =
                    SURFACE_LABELS[m.surface ?? ""] ?? m.surface ?? "powierzchnia";
                  const isOpen = expandedMarker === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedMarker(isOpen ? null : m.id)
                        }
                        className="w-full px-4 py-2.5 flex items-center gap-3 text-left"
                        aria-expanded={isOpen}
                      >
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{
                            background: "rgba(239, 68, 68, 0.18)",
                            color: "#fca5a5",
                          }}
                        >
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-[10px] uppercase tracking-wider"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {surfaceLabel}
                          </p>
                          <p className="text-sm truncate">
                            {m.description?.trim() || "(bez opisu)"}
                          </p>
                        </div>
                        <ChevronDown
                          className="w-4 h-4 flex-shrink-0 transition-transform"
                          style={{
                            color: "var(--text-muted)",
                            transform: isOpen
                              ? "rotate(180deg)"
                              : "rotate(0deg)",
                          }}
                          aria-hidden
                        />
                      </button>
                      {isOpen && (
                        <div
                          className="px-4 pb-3 text-xs space-y-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <p>
                            <span className="font-mono">x</span>{" "}
                            <span className="font-mono">{m.x.toFixed(3)}</span>
                            {"  "}
                            <span className="font-mono">y</span>{" "}
                            <span className="font-mono">{m.y.toFixed(3)}</span>
                            {"  "}
                            <span className="font-mono">z</span>{" "}
                            <span className="font-mono">{m.z.toFixed(3)}</span>
                          </p>
                          {m.description && (
                            <p
                              style={{ color: "var(--text-main)" }}
                              className="text-sm"
                            >
                              {m.description}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {additionalNotes && (
            <section
              className="rounded-2xl border p-4"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <h3
                className="text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Uwagi dodatkowe sprzedawcy
              </h3>
              <p className="text-sm whitespace-pre-wrap">{additionalNotes}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
