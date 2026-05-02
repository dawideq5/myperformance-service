"use client";

import { useMemo, useState } from "react";
import { Loader2, Truck, X } from "lucide-react";
import type { ServiceTicket } from "./tabs/ServicesBoard";

export interface TransportLocationOption {
  id: string;
  name: string;
}

interface TransportModalProps {
  service: ServiceTicket;
  /** Lista lokalizacji dostępnych jako cel transportu — komponent sam
   *  filtruje aktualną lokalizację serwisu. */
  availableLocations: TransportLocationOption[];
  onClose: () => void;
  onSuccess: (updatedService: ServiceTicket) => void;
}

/**
 * Modal "Wyślij do innego serwisu" — tworzy zlecenie transportu między
 * punktami serwisowymi i jednocześnie wstrzymuje zlecenie. Backend
 * (`POST /api/relay/services/[id]/transport`) waliduje lokalizację i
 * przełącza status na on_hold.
 */
export function TransportModal({
  service,
  availableLocations,
  onClose,
  onSuccess,
}: TransportModalProps) {
  const currentLocationId =
    service.serviceLocationId ?? service.locationId ?? null;
  const targetOptions = useMemo(
    () =>
      availableLocations.filter(
        (l) => !currentLocationId || l.id !== currentLocationId,
      ),
    [availableLocations, currentLocationId],
  );

  const [targetLocationId, setTargetLocationId] = useState<string>(
    targetOptions[0]?.id ?? "",
  );
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    targetLocationId.length > 0 && reason.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/relay/services/${service.id}/transport`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetLocationId,
            reason: reason.trim(),
            note: note.trim() || undefined,
          }),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; service?: ServiceTicket; error?: string }
        | null;
      if (res.status === 423 || res.status === 409) {
        setError(
          json?.error ??
            "Zlecenie zablokowane — istnieje już aktywny transport tego urządzenia.",
        );
        return;
      }
      if (!res.ok) {
        setError(json?.error ?? `Błąd serwera (HTTP ${res.status})`);
        return;
      }
      if (json?.service) {
        onSuccess(json.service);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd sieci");
    } finally {
      setSubmitting(false);
    }
  };

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
            />
            <h2 id="transport-modal-title" className="text-base font-semibold">
              Wyślij do innego serwisu
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

              {error && (
                <div
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
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Wyślij do serwisu
          </button>
        </div>
      </div>
    </div>
  );
}
