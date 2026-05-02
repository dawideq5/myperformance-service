"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { ServiceTicket } from "../tabs/ServicesBoard";
import { ClearableInput } from "../ui/ClearableInput";

interface EditCustomerModalProps {
  service: ServiceTicket;
  onClose: () => void;
  onSaved: (updated: ServiceTicket) => void;
}

/** Wave 20 / Faza 1D — edycja danych klienta przez serwisanta.
 * Submit → PATCH `/api/relay/services/{id}` z polami z formularza.
 * Server-side logujemy `customer_data_updated` w action log.
 */
export function EditCustomerModal({
  service,
  onClose,
  onSaved,
}: EditCustomerModalProps) {
  const [firstName, setFirstName] = useState(service.customerFirstName ?? "");
  const [lastName, setLastName] = useState(service.customerLastName ?? "");
  const [phone, setPhone] = useState(service.contactPhone ?? "");
  const [email, setEmail] = useState(service.contactEmail ?? "");
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

  const validate = (): string | null => {
    if (email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
        return "Niepoprawny format adresu e-mail.";
      }
    }
    if (phone.trim()) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 9) {
        return "Telefon musi zawierać co najmniej 9 cyfr.";
      }
    }
    return null;
  };

  const onSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    const body: Record<string, unknown> = {};
    if (firstName.trim() !== (service.customerFirstName ?? "")) {
      body.customerFirstName = firstName.trim() || null;
    }
    if (lastName.trim() !== (service.customerLastName ?? "")) {
      body.customerLastName = lastName.trim() || null;
    }
    if (phone.trim() !== (service.contactPhone ?? "")) {
      body.contactPhone = phone.trim() || null;
    }
    if (email.trim().toLowerCase() !== (service.contactEmail ?? "")) {
      body.contactEmail = email.trim().toLowerCase() || null;
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
        aria-labelledby="customer-edit-title"
        className="w-full max-w-md rounded-2xl border overflow-hidden flex flex-col"
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
            id="customer-edit-title"
            className="text-sm font-semibold"
            style={{ color: "var(--text-main)" }}
          >
            Edytuj dane klienta
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

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="cust-first"
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Imię
              </label>
              <input
                id="cust-first"
                ref={firstFocusRef}
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
                autoComplete="given-name"
              />
            </div>
            <div>
              <label
                htmlFor="cust-last"
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Nazwisko
              </label>
              <input
                id="cust-last"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
                autoComplete="family-name"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="cust-phone"
              className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Telefon
            </label>
            <ClearableInput
              id="cust-phone"
              type="tel"
              value={phone}
              onValueChange={setPhone}
              optional
              clearAriaLabel="Wyczyść pole telefonu klienta"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
              autoComplete="tel"
              placeholder="+48 …"
            />
          </div>

          <div>
            <label
              htmlFor="cust-email"
              className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              E-mail
            </label>
            <ClearableInput
              id="cust-email"
              type="email"
              value={email}
              onValueChange={setEmail}
              optional
              clearAriaLabel="Wyczyść pole e-mail klienta"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
              autoComplete="email"
              placeholder="klient@example.com"
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
