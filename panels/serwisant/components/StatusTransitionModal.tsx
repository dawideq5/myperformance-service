"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import {
  STATUS_META,
  getStatusMeta,
  type ServiceStatus,
} from "@/lib/serwisant/status-meta";
import {
  canTransition,
  getAllowedTargets,
  requiresCancellationReason,
  requiresHoldReason,
  type ServiceTransitionRole,
} from "@/lib/serwisant/transitions";
import type { ServiceTicket } from "./tabs/ServicesBoard";

interface StatusTransitionModalProps {
  service: ServiceTicket;
  /** Pre-selected target status. */
  targetStatus?: ServiceStatus;
  open: boolean;
  onClose: () => void;
  onSuccess: (updatedService: ServiceTicket) => void;
  /** Domyślnie `service`. */
  role?: ServiceTransitionRole;
}

export function StatusTransitionModal({
  service,
  targetStatus,
  open,
  onClose,
  onSuccess,
  role = "service",
}: StatusTransitionModalProps) {
  const from = (service.status ?? "received") as ServiceStatus;
  const allowedTargets = useMemo(
    () => getAllowedTargets(from, role),
    [from, role],
  );

  const [target, setTarget] = useState<ServiceStatus | "">(
    targetStatus && canTransition(from, targetStatus, role) ? targetStatus : "",
  );
  const [note, setNote] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFocusRef = useRef<HTMLSelectElement | null>(null);

  // Reset stanu przy reopenie / zmianie targetu.
  useEffect(() => {
    if (open) {
      setTarget(
        targetStatus && canTransition(from, targetStatus, role)
          ? targetStatus
          : "",
      );
      setNote("");
      setHoldReason("");
      setCancellationReason("");
      setError(null);
      setSubmitting(false);
    }
  }, [open, targetStatus, from, role]);

  // ESC zamyka, focus trap (Tab cyklujemy w modalu).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
    // Auto-focus pierwszy interaktywny element.
    firstFocusRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const targetMeta = target ? getStatusMeta(target) : null;
  const needsHoldReason = target ? requiresHoldReason(target) : false;
  const needsCancellationReason = target
    ? requiresCancellationReason(target)
    : false;

  const canSubmit =
    !!target &&
    !submitting &&
    (!needsHoldReason || holdReason.trim().length > 0) &&
    (!needsCancellationReason || cancellationReason.trim().length > 0);

  const submit = async () => {
    if (!target || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        status: target,
        role,
      };
      if (note.trim()) body.note = note.trim();
      if (needsHoldReason) body.holdReason = holdReason.trim();
      if (needsCancellationReason)
        body.cancellationReason = cancellationReason.trim();

      const res = await fetch(`/api/relay/services/${service.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 423) {
        setError(
          "Urządzenie jest w transporcie — zwolnij lock w transport jobs, aby zmienić status.",
        );
        setSubmitting(false);
        return;
      }
      if (res.status === 409) {
        setError("To przejście statusu nie jest dozwolone.");
        setSubmitting(false);
        return;
      }
      const json = (await res.json().catch(() => null)) as
        | { service?: ServiceTicket; error?: string }
        | null;
      if (!res.ok) {
        setError(json?.error ?? `Błąd zapisu (HTTP ${res.status})`);
        setSubmitting(false);
        return;
      }
      if (json?.service) {
        onSuccess(json.service);
      }
      onClose();
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
        aria-labelledby="status-transition-title"
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
          <h2
            id="status-transition-title"
            className="text-sm font-semibold"
            style={{ color: "var(--text-main)" }}
          >
            Zmień status zlecenia #{service.ticketNumber}
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

        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <p
              className="text-[11px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              Aktualny status
            </p>
            <div className="flex items-center gap-2">
              <StatusBadge status={from} size="md" />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {getStatusMeta(from).description}
              </span>
            </div>
          </div>

          <div>
            <label
              className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
              style={{ color: "var(--text-muted)" }}
              htmlFor="status-target"
            >
              Nowy status
            </label>
            {allowedTargets.length === 0 ? (
              <p
                className="text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                Brak dozwolonych przejść z aktualnego statusu.
              </p>
            ) : (
              <select
                id="status-target"
                ref={firstFocusRef}
                value={target}
                onChange={(e) => setTarget(e.target.value as ServiceStatus)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              >
                <option value="">— Wybierz status —</option>
                {allowedTargets.map((t) => (
                  <option key={t} value={t}>
                    {STATUS_META[t]?.label ?? t}
                  </option>
                ))}
              </select>
            )}
            {targetMeta && (
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                {targetMeta.description}
              </p>
            )}
          </div>

          {needsHoldReason && (
            <div>
              <label
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--text-muted)" }}
                htmlFor="hold-reason"
              >
                Powód wstrzymania (wymagane)
              </label>
              <textarea
                id="hold-reason"
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
                placeholder="Krótko opisz dlaczego zlecenie zostaje wstrzymane…"
                required
              />
            </div>
          )}

          {needsCancellationReason && (
            <div>
              <label
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--text-muted)" }}
                htmlFor="cancellation-reason"
              >
                Powód zakończenia (wymagane)
              </label>
              <textarea
                id="cancellation-reason"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
                placeholder="Wpisz powód anulowania, odrzucenia lub zwrotu…"
                required
              />
            </div>
          )}

          <div>
            <label
              className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
              style={{ color: "var(--text-muted)" }}
              htmlFor="status-note"
            >
              Notatka (opcjonalnie)
            </label>
            <textarea
              id="status-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
              placeholder="Dodatkowy kontekst do logu zdarzeń…"
            />
          </div>

          {error && (
            <div
              className="p-2 rounded-lg text-sm"
              style={{
                background: "rgba(239,68,68,0.08)",
                color: "#ef4444",
              }}
              role="alert"
            >
              {error}
            </div>
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
            className="px-3 py-1.5 rounded-lg text-xs font-medium border"
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
            disabled={!canSubmit}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Zatwierdź
          </button>
        </div>
      </div>
    </div>
  );
}
