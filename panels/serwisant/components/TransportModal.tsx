"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Truck, X } from "lucide-react";
import type { ServiceTicket } from "./tabs/ServicesBoard";

export interface TransportLocationOption {
  id: string;
  name: string;
}

export interface TransportJobForEdit {
  id: string;
  destinationLocationId: string | null;
  reason: string | null;
  notes: string | null;
}

export type TransportModalMode = "create" | "edit";

interface TransportModalProps {
  service: ServiceTicket;
  /** Lista lokalizacji dostępnych jako cel transportu — komponent sam
   *  filtruje aktualną lokalizację serwisu. */
  availableLocations: TransportLocationOption[];
  onClose: () => void;
  onSuccess: (updatedService?: ServiceTicket) => void;
  /** Tryb modalu — `create` (Wave 19) lub `edit` (Wave 20 1C). */
  mode?: TransportModalMode;
  /** Wymagane gdy mode === "edit" — istniejące dane do prefill. */
  existingJob?: TransportJobForEdit | null;
}

/**
 * Modal "Wyślij/Edytuj transport" — w trybie create tworzy zlecenie + wstrzymuje
 * serwis (POST), w edit aktualizuje istniejące (PATCH). UI rozróżniony przez
 * `mode` prop — tytuł, button label, target endpoint.
 *
 * Edit jest dozwolony tylko dla jobs ze statusem `queued` (sprawdzane
 * dodatkowo backendowo). Po pickupie kierowca już ma trasę u siebie i edycja
 * z poziomu serwisanta nie ma sensu.
 */
export function TransportModal({
  service,
  availableLocations,
  onClose,
  onSuccess,
  mode = "create",
  existingJob = null,
}: TransportModalProps) {
  const isEdit = mode === "edit" && !!existingJob;
  const currentLocationId =
    service.serviceLocationId ?? service.locationId ?? null;
  const targetOptions = useMemo(
    () =>
      availableLocations.filter(
        (l) => !currentLocationId || l.id !== currentLocationId,
      ),
    [availableLocations, currentLocationId],
  );

  // Prefill: edit → existingJob; create → pierwsza dostępna opcja.
  const [targetLocationId, setTargetLocationId] = useState<string>(
    isEdit
      ? existingJob?.destinationLocationId ?? targetOptions[0]?.id ?? ""
      : targetOptions[0]?.id ?? "",
  );
  const [reason, setReason] = useState(
    isEdit ? existingJob?.reason ?? "" : "",
  );
  const [note, setNote] = useState(isEdit ? existingJob?.notes ?? "" : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resetuj target gdy lista lokacji się załaduje (race przy pierwszym mount).
  useEffect(() => {
    if (!targetLocationId && targetOptions[0]?.id) {
      setTargetLocationId(targetOptions[0].id);
    }
  }, [targetOptions, targetLocationId]);

  const canSubmit =
    targetLocationId.length > 0 && reason.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const url = isEdit
        ? `/api/relay/services/${service.id}/transport/${existingJob?.id}`
        : `/api/relay/services/${service.id}/transport`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLocationId,
          reason: reason.trim(),
          note: note.trim() || (isEdit ? "" : undefined),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; service?: ServiceTicket; error?: string }
        | null;
      if (res.status === 423 || res.status === 409) {
        setError(
          json?.error ??
            "Zlecenie zablokowane — nie można edytować po odbiorze przez kierowcę.",
        );
        return;
      }
      if (!res.ok) {
        setError(json?.error ?? `Błąd serwera (HTTP ${res.status})`);
        return;
      }
      onSuccess(json?.service);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd sieci");
    } finally {
      setSubmitting(false);
    }
  };

  const title = isEdit
    ? "Edytuj zlecenie transportu"
    : "Wyślij do innego serwisu";
  const submitLabel = isEdit ? "Zapisz zmiany" : "Wyślij do serwisu";

  return (
    <div
      className="fixed inset-0 z-[2050] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="transport-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border overflow-hidden flex flex-col"
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
            <Truck
              className="w-4 h-4"
              style={{ color: "var(--text-muted)" }}
              aria-hidden="true"
            />
            <h2 id="transport-modal-title" className="text-base font-semibold">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-lg disabled:opacity-50"
            style={{ color: "var(--text-muted)" }}
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {targetOptions.length === 0 ? (
            <p
              className="text-sm p-3 rounded-lg border"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              Brak innych punktów serwisowych dostępnych jako cel transportu.
              Skontaktuj się z administratorem aby przypisać dodatkowe
              lokalizacje.
            </p>
          ) : (
            <>
              <div>
                <label
                  htmlFor="transport-target"
                  className="block text-xs uppercase tracking-wider font-semibold mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Punkt docelowy
                </label>
                <select
                  id="transport-target"
                  value={targetLocationId}
                  onChange={(e) => setTargetLocationId(e.target.value)}
                  disabled={submitting}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                >
                  {targetOptions.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="transport-reason"
                  className="block text-xs uppercase tracking-wider font-semibold mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Powód transportu
                </label>
                <textarea
                  id="transport-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  required
                  aria-required="true"
                  disabled={submitting}
                  placeholder="np. Brak narzędzi do wymiany płyty głównej"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-y"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="transport-note"
                  className="block text-xs uppercase tracking-wider font-semibold mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Notatka dla kierowcy (opcjonalnie)
                </label>
                <textarea
                  id="transport-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  disabled={submitting}
                  placeholder="Uwagi dotyczące pakowania, godzin odbioru itp."
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-y"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                />
              </div>

              {!isEdit && (
                <div
                  className="text-xs rounded-lg border p-2"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-muted)",
                  }}
                >
                  Zlecenie zostanie wstrzymane z powodem &bdquo;Transport do
                  innego serwisu&rdquo; do czasu odbioru przez kierowcę.
                  Aktualny status (
                  <span style={{ color: "var(--text-main)" }}>
                    {service.status}
                  </span>
                  ) zostanie zapamiętany do wznowienia.
                </div>
              )}
              {error && (
                <div
                  role="alert"
                  className="text-sm rounded-lg border p-2"
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    borderColor: "rgba(239, 68, 68, 0.4)",
                    color: "#fca5a5",
                  }}
                >
                  {error}
                </div>
              )}
            </>
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
            className="px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-50"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit || targetOptions.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
