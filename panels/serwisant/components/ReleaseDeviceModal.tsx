"use client";

/**
 * Wave 21 / Faza 1C — modal "Wydaj urządzenie".
 *
 * Pracownik wpisuje 6-cyfrowy kod podany przez klienta. Po success backend
 * ustawia `service.status = "closed"` i zwraca zaktualizowany rekord.
 *
 * Funkcje:
 *   - 6-cyfrowy OTP input z `inputMode=numeric` + `autoComplete=one-time-code`
 *     dla wsparcia auto-fill z SMS (mobile).
 *   - "Wyślij ponownie kod" — dropdown email/sms → POST /release/resend.
 *   - Komunikaty błędów: niepoprawny kod (z attemptsLeft), zalockowany
 *     do HH:MM, kod już wykorzystany.
 *   - A11y: role=dialog, aria-modal, focus trap, ESC zamyka.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, X, Send } from "lucide-react";
import type { ServiceTicket } from "./tabs/ServicesBoard";

interface ReleaseDeviceModalProps {
  service: ServiceTicket;
  open: boolean;
  onClose: () => void;
  onSuccess: (updated: ServiceTicket) => void;
}

interface ReleaseError {
  message: string;
  /** Pozostała liczba prób — gdy kod niepoprawny ale jeszcze nie locked. */
  attemptsLeft?: number;
  /** ISO gdy kod zalockowany do tego czasu. */
  lockedUntil?: string;
}

function fmtLockedUntil(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ReleaseDeviceModal({
  service,
  open,
  onClose,
  onSuccess,
}: ReleaseDeviceModalProps) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [error, setError] = useState<ReleaseError | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFocusRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setCode("");
      setError(null);
      setInfo(null);
      setSubmitting(false);
      setResending(false);
      setResendOpen(false);
    }
  }, [open]);

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
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  }, [open, onClose]);

  if (!open) return null;

  const canSubmit = code.length === 6 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/relay/services/${service.id}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            service?: ServiceTicket;
            error?: string;
            attemptsLeft?: number | null;
            lockedUntil?: string | null;
          }
        | null;
      if (res.status === 423) {
        setError({
          message:
            "Konto zablokowane ze względu na zbyt wiele błędnych prób.",
          lockedUntil: json?.lockedUntil ?? undefined,
        });
        setSubmitting(false);
        return;
      }
      if (res.status === 410) {
        setError({ message: "Ten kod został już wykorzystany." });
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        setError({
          message: json?.error ?? `Błąd weryfikacji (HTTP ${res.status})`,
          attemptsLeft:
            typeof json?.attemptsLeft === "number"
              ? json.attemptsLeft
              : undefined,
        });
        setSubmitting(false);
        return;
      }
      if (json?.service) onSuccess(json.service);
      onClose();
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : "Błąd sieci",
      });
      setSubmitting(false);
    }
  };

  const resend = async (channel: "email" | "sms") => {
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(
        `/api/relay/services/${service.id}/release/resend`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel }),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; channel?: string; error?: string }
        | null;
      if (!res.ok) {
        setError({
          message: json?.error ?? `Nie udało się wysłać kodu (HTTP ${res.status})`,
        });
        setResending(false);
        return;
      }
      const label = channel === "email" ? "email" : "SMS";
      setInfo(`Nowy kod został wysłany (${label}).`);
      setCode("");
      setResendOpen(false);
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : "Błąd sieci",
      });
    } finally {
      setResending(false);
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
        aria-labelledby="release-device-title"
        className="w-full max-w-md rounded-2xl border shadow-xl"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <h2
            id="release-device-title"
            className="text-base font-semibold"
            style={{ color: "var(--text-main)" }}
          >
            Wydanie urządzenia — #{service.ticketNumber}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="p-1 rounded hover:bg-[var(--bg-surface)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p
            className="text-xs"
            style={{ color: "var(--text-muted)", lineHeight: 1.5 }}
          >
            Poproś klienta o podanie 6-cyfrowego kodu wydania, który otrzymał
            mailem lub SMS-em przy przyjmowaniu urządzenia.
          </p>

          <label className="block">
            <span
              className="text-xs font-semibold block mb-1.5"
              style={{ color: "var(--text-main)" }}
            >
              Kod wydania (6 cyfr)
            </span>
            <input
              ref={firstFocusRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) {
                  e.preventDefault();
                  void submit();
                }
              }}
              disabled={submitting}
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "release-code-error" : undefined}
              className="w-full px-4 py-3 rounded-xl border text-center font-mono outline-none focus:border-[var(--accent)]"
              style={{
                background: "var(--bg-surface)",
                borderColor: error
                  ? "rgba(239, 68, 68, 0.6)"
                  : "var(--border-subtle)",
                color: "var(--text-main)",
                fontSize: 22,
                letterSpacing: 8,
              }}
              placeholder="••••••"
            />
          </label>

          {error && (
            <div
              id="release-code-error"
              role="alert"
              className="rounded-xl border px-3 py-2 text-xs space-y-1"
              style={{
                background: "rgba(239, 68, 68, 0.08)",
                borderColor: "rgba(239, 68, 68, 0.4)",
                color: "#ef4444",
              }}
            >
              <p className="font-semibold">{error.message}</p>
              {typeof error.attemptsLeft === "number" && (
                <p style={{ color: "rgba(239, 68, 68, 0.85)" }}>
                  Niepoprawny kod, pozostało prób: {error.attemptsLeft}.
                </p>
              )}
              {error.lockedUntil && (
                <p style={{ color: "rgba(239, 68, 68, 0.85)" }}>
                  Konto zablokowane do {fmtLockedUntil(error.lockedUntil)}.
                </p>
              )}
            </div>
          )}

          {info && !error && (
            <div
              role="status"
              className="rounded-xl border px-3 py-2 text-xs"
              style={{
                background: "rgba(34, 197, 94, 0.08)",
                borderColor: "rgba(34, 197, 94, 0.4)",
                color: "#22c55e",
              }}
            >
              {info}
            </div>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setResendOpen((v) => !v);
                setError(null);
              }}
              disabled={resending || submitting}
              className="inline-flex items-center gap-1.5 text-xs font-medium underline disabled:opacity-50"
              style={{ color: "var(--accent)" }}
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              Wyślij ponownie kod
            </button>
            {resendOpen && (
              <div
                role="menu"
                className="absolute z-10 mt-2 left-0 rounded-xl border shadow-lg overflow-hidden"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-subtle)",
                  minWidth: 200,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={!service.contactEmail || resending}
                  onClick={() => void resend("email")}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-surface)] disabled:opacity-50"
                  style={{ color: "var(--text-main)" }}
                >
                  Email
                  {!service.contactEmail && (
                    <span
                      className="block text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      brak adresu klienta
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!service.contactPhone || resending}
                  onClick={() => void resend("sms")}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-surface)] disabled:opacity-50 border-t"
                  style={{
                    color: "var(--text-main)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  SMS
                  {!service.contactPhone && (
                    <span
                      className="block text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      brak numeru klienta
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-4 border-t"
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
            disabled={!canSubmit}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {submitting && (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            )}
            Wydaj
          </button>
        </div>
      </div>
    </div>
  );
}
