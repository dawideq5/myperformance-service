"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { ServiceTicket } from "../tabs/ServicesBoard";
import { ClearableInput } from "../ui/ClearableInput";

interface EditDeviceConditionModalProps {
  service: ServiceTicket;
  onClose: () => void;
  onSaved: (updated: ServiceTicket) => void;
}

interface VisualConditionLite {
  display_rating?: number | null;
  display_notes?: string | null;
  back_rating?: number | null;
  back_notes?: string | null;
  camera_rating?: number | null;
  camera_notes?: string | null;
  frames_rating?: number | null;
  frames_notes?: string | null;
  additional_notes?: string | null;
}

const RATING_FIELDS: Array<{
  key: keyof VisualConditionLite;
  notesKey: keyof VisualConditionLite;
  label: string;
}> = [
  { key: "display_rating", notesKey: "display_notes", label: "Wyświetlacz" },
  { key: "back_rating", notesKey: "back_notes", label: "Panel tylny" },
  { key: "camera_rating", notesKey: "camera_notes", label: "Aparaty" },
  { key: "frames_rating", notesKey: "frames_notes", label: "Ramki boczne" },
];

/** Wave 20 / Faza 1D — modal edycji stanu technicznego urządzenia.
 * Pola: oceny 1-10 per element + notatki + additional_notes + lockCode + imei.
 * Submit → PATCH `/api/relay/services/{id}` z visualCondition + lockCode + imei.
 * Backend per-marker logging nie aplikuje się tu (markery są edytowane w
 * PhoneViewer3D), ale ogólny revision zapis działa standardowo + dodajemy
 * dedykowany action `device_condition_updated`.
 */
export function EditDeviceConditionModal({
  service,
  onClose,
  onSaved,
}: EditDeviceConditionModalProps) {
  const vc = (service.visualCondition ?? {}) as Record<string, unknown>;
  const initial: VisualConditionLite = {
    display_rating: typeof vc.display_rating === "number" ? vc.display_rating : null,
    display_notes: typeof vc.display_notes === "string" ? vc.display_notes : "",
    back_rating: typeof vc.back_rating === "number" ? vc.back_rating : null,
    back_notes: typeof vc.back_notes === "string" ? vc.back_notes : "",
    camera_rating: typeof vc.camera_rating === "number" ? vc.camera_rating : null,
    camera_notes: typeof vc.camera_notes === "string" ? vc.camera_notes : "",
    frames_rating: typeof vc.frames_rating === "number" ? vc.frames_rating : null,
    frames_notes: typeof vc.frames_notes === "string" ? vc.frames_notes : "",
    additional_notes:
      typeof vc.additional_notes === "string" ? vc.additional_notes : "",
  };
  const [form, setForm] = useState<VisualConditionLite>(initial);
  const [lockCode, setLockCode] = useState(service.lockCode ?? "");
  const [imei, setImei] = useState(service.imei ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFocusRef = useRef<HTMLInputElement | null>(null);

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
    firstFocusRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const validateImei = (v: string): string | null => {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length !== 15 && digits.length !== 17) {
      return "IMEI musi mieć 15 cyfr (lub 17 dla MEID).";
    }
    return null;
  };

  const onSubmit = async () => {
    const imeiError = validateImei(imei);
    if (imeiError) {
      setError(imeiError);
      return;
    }
    setSubmitting(true);
    setError(null);
    // Build patch — tylko zmienione pola.
    const visualPatch: Record<string, unknown> = {};
    for (const f of RATING_FIELDS) {
      if (form[f.key] !== initial[f.key]) {
        visualPatch[f.key as string] = form[f.key] ?? null;
      }
      if ((form[f.notesKey] ?? "") !== (initial[f.notesKey] ?? "")) {
        visualPatch[f.notesKey as string] =
          (form[f.notesKey] as string | null | undefined)?.toString().trim() ||
          null;
      }
    }
    if ((form.additional_notes ?? "") !== (initial.additional_notes ?? "")) {
      visualPatch.additional_notes =
        (form.additional_notes ?? "").toString().trim() || null;
    }

    const body: Record<string, unknown> = {};
    if (Object.keys(visualPatch).length > 0) {
      body.visualCondition = visualPatch;
    }
    if (lockCode.trim() !== (service.lockCode ?? "")) {
      body.lockCode = lockCode.trim() || null;
    }
    if (imei.trim() !== (service.imei ?? "")) {
      body.imei = imei.trim() || null;
    }
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    try {
      const res = await fetch(`/api/relay/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as
        | { service?: ServiceTicket; error?: string }
        | null;
      if (!res.ok) {
        setError(json?.error ?? `Błąd zapisu (HTTP ${res.status})`);
        setSubmitting(false);
        return;
      }
      // Loguje się server-side w PATCH route — `device_condition_updated`
      // emit'owane przy zmianie lockCode/imei/visualCondition/imei.
      if (json?.service) onSaved(json.service);
      else onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd sieci");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center p-4"
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
        aria-labelledby="condition-edit-title"
        className="w-full max-w-xl rounded-2xl border overflow-hidden flex flex-col max-h-[90vh]"
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
            id="condition-edit-title"
            className="text-sm font-semibold"
            style={{ color: "var(--text-main)" }}
          >
            Edytuj stan techniczny urządzenia
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg"
            style={{ color: "var(--text-muted)" }}
            aria-label="Zamknij"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Lock code + IMEI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="lock-code"
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Kod blokady
              </label>
              <ClearableInput
                id="lock-code"
                ref={firstFocusRef}
                type="text"
                value={lockCode}
                onValueChange={setLockCode}
                optional
                clearAriaLabel="Wyczyść pole kodu blokady"
                placeholder="np. 1234, brak"
                className="w-full px-3 py-2 rounded-lg border text-sm font-mono outline-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              />
            </div>
            <div>
              <label
                htmlFor="imei-field"
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                IMEI
              </label>
              <ClearableInput
                id="imei-field"
                type="text"
                value={imei}
                onValueChange={setImei}
                optional
                clearAriaLabel="Wyczyść pole IMEI"
                placeholder="15 cyfr (lub 17 dla MEID)"
                className="w-full px-3 py-2 rounded-lg border text-sm font-mono outline-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              />
            </div>
          </div>

          {/* Oceny 1-10 + notes per element */}
          <div className="space-y-3">
            <p
              className="text-[11px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              Oceny stanu (1–10)
            </p>
            {RATING_FIELDS.map((f) => (
              <div key={f.key as string} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor={`rating-${f.key as string}`}
                    className="text-sm"
                    style={{ color: "var(--text-main)" }}
                  >
                    {f.label}
                  </label>
                  <input
                    id={`rating-${f.key as string}`}
                    type="number"
                    min={1}
                    max={10}
                    value={(form[f.key] as number | null) ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const n =
                        v === "" ? null : Math.max(1, Math.min(10, Number(v)));
                      setForm((s) => ({ ...s, [f.key]: n }));
                    }}
                    className="w-20 px-2 py-1 rounded-lg border text-sm font-mono text-right outline-none"
                    style={{
                      background: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-main)",
                    }}
                  />
                </div>
                <ClearableInput
                  type="text"
                  value={(form[f.notesKey] as string | null) ?? ""}
                  onValueChange={(v) =>
                    setForm((s) => ({ ...s, [f.notesKey]: v }))
                  }
                  optional
                  clearAriaLabel={`Wyczyść notatki dla ${f.label.toLowerCase()}`}
                  placeholder="Notatki (opcjonalne)"
                  className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                />
              </div>
            ))}
          </div>

          <div>
            <label
              htmlFor="additional-notes"
              className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Uwagi dodatkowe
            </label>
            <textarea
              id="additional-notes"
              value={(form.additional_notes as string | null) ?? ""}
              onChange={(e) =>
                setForm((s) => ({ ...s, additional_notes: e.target.value }))
              }
              rows={3}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-y"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
              placeholder="Dodatkowe obserwacje techniczne…"
            />
          </div>

          {error && (
            <p className="text-xs" style={{ color: "#ef4444" }}>
              {error}
            </p>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-3 border-t"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 rounded-lg text-sm border disabled:opacity-50"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={submitting}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Zapisz zmiany
          </button>
        </div>
      </div>
    </div>
  );
}
