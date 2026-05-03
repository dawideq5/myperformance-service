"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { ServiceTicket } from "./tabs/ServicesBoard";
import { AddServiceForm } from "./intake/AddServiceForm";

interface QuickIntakeModalProps {
  /** ID punktu (sprzedaży lub serwisu) — auto-pre-filled przy tworzeniu. */
  defaultLocationId: string;
  /** Lista lokalizacji — propowane do AddServiceForm tylko gdy >1 (UI dropdown). */
  availableLocations: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (service: ServiceTicket) => void;
}

/**
 * Wave 22 / F12 — pełny formularz intake dla serwisanta w modal.
 *
 * Zastępuje wcześniejszą uproszczoną wersję (Wave 20 / Faza 1D, kilka pól).
 * Zgodnie z decyzją produktową: serwisant ma TEN SAM pełny formularz co
 * sprzedawca — z 3D walkthroughiem, blokadą, opisem usterki, wyceną,
 * danymi klienta i potwierdzeniem odbioru. Różnice tylko opcjonalne:
 *
 *   - Brak sekcji "Punkt serwisowy" (serwisant *jest* punktem serwisowym).
 *   - Brak wyboru kanału kodu wydania (sales-only flow z Wave 21/Faza 1C).
 *   - Po sukcesie zamiast redirectu wywołujemy `onCreated(service)` — parent
 *     (PanelHome) wstawia zlecenie do listy + auto-selectuje detail view.
 *
 * Pełną logikę zawiera `intake/AddServiceForm.tsx` (mode="service"). Tutaj
 * tylko modal chrome + ESC/focus-trap + scroll container.
 */
export function QuickIntakeModal({
  defaultLocationId,
  availableLocations,
  onClose,
  onCreated,
}: QuickIntakeModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // ESC zamyka, Tab keeps focus inside dialog (focus-trap).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // availableLocations jest dostępne ale obecnie AddServiceForm nie obsługuje
  // jawnego wyboru lokalizacji (locationId jest stałe per session). Trzymamy
  // signature zgodne z poprzednim QuickIntakeModal żeby nie łamać callerów.
  void availableLocations;

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-intake-title"
        className="w-full max-w-3xl rounded-2xl border overflow-hidden flex flex-col max-h-[95vh]"
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
          <h2
            id="quick-intake-title"
            className="text-sm font-semibold"
            style={{ color: "var(--text-main)" }}
          >
            Nowe zlecenie
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-surface)] transition-colors"
            style={{ color: "var(--text-muted)" }}
            aria-label="Zamknij"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 sm:px-5 py-4 overflow-y-auto flex-1">
          <AddServiceForm
            mode="service"
            locationId={defaultLocationId}
            onEditDone={onClose}
            onCreated={(service) => {
              // Parent (PanelHome) przejmuje pełny flow: insert + auto-select +
              // refresh. Zwracamy `true` żeby formularz NIE robił domyślnego
              // redirectu / nie pokazywał wewnętrznego "success" message.
              onCreated(service as unknown as ServiceTicket);
              return true;
            }}
            onError={({ title, message }) => {
              // Serwisant nie ma ToastProvider → fallback do alert. W przyszłości
              // można podpiąć dedykowany serwisant toast, gdy powstanie.
              if (typeof window !== "undefined") {
                window.alert(`${title}\n\n${message}`);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
