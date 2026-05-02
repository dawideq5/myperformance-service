"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { ServiceTicket } from "./tabs/ServicesBoard";

interface QuickIntakeModalProps {
  /** ID punktu sprzedaży (lub serwisu) — auto-pre-filled przy tworzeniu. */
  defaultLocationId: string;
  /** Lista lokalizacji do których serwisant ma dostęp (pomocnicze przy
   * przełączeniu locationId — domyślnie ukryte gdy 1 punkt). */
  availableLocations: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (service: ServiceTicket) => void;
}

/**
 * Wave 20 / Faza 1D — lekki wariant intake dla serwisanta.
 *
 * Pola (minimalne):
 *   - imię + nazwisko klienta
 *   - telefon, email
 *   - marka, model, IMEI
 *   - opis usterki
 *   - lokacja (z `availableLocations`)
 *
 * Bez wizualnej kontroli 3D, bez podpisu, bez wyceny — szybkie utworzenie
 * zlecenia o status "received" przez serwisanta. Po sukcesie zwracamy
 * `service` do parenta (PanelHome) który może przełączyć view do detail.
 *
 * Endpoint: POST `/api/relay/services` (panel POST przez relay).
 */
export function QuickIntakeModal({
  defaultLocationId,
  availableLocations,
  onClose,
  onCreated,
}: QuickIntakeModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [imei, setImei] = useState("");
  const [description, setDescription] = useState("");
  const [locationId, setLocationId] = useState(defaultLocationId);
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
    if (!firstName.trim()) return "Imię klienta jest wymagane.";
    if (!lastName.trim()) return "Nazwisko klienta jest wymagane.";
    if (!phone.trim()) return "Telefon kontaktowy jest wymagany.";
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9)
      return "Telefon musi zawierać co najmniej 9 cyfr.";
    if (!brand.trim()) return "Marka urządzenia jest wymagana.";
    if (!model.trim()) return "Model urządzenia jest wymagany.";
    if (!locationId) return "Wybierz lokalizację dla zlecenia.";
    if (
      email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
    ) {
      return "Niepoprawny format adresu e-mail.";
    }
    if (imei.trim()) {
      const id = imei.replace(/\D/g, "");
      if (id.length !== 15 && id.length !== 17) {
        return "IMEI musi mieć 15 cyfr (lub 17 dla MEID).";
      }
    }
    return null;
  };

  const onSubmit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = {
      locationId,
      type: "phone",
      brand: brand.trim(),
      model: model.trim(),
      imei: imei.trim() || null,
      description: description.trim() || null,
      customerFirstName: firstName.trim(),
      customerLastName: lastName.trim(),
      contactPhone: phone.trim(),
      contactEmail: email.trim().toLowerCase() || null,
    };
    try {
      const res = await fetch("/api/relay/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as
        | { service?: ServiceTicket; error?: string }
        | null;
      if (!res.ok || !json?.service) {
        setError(json?.error ?? `Błąd zapisu (HTTP ${res.status})`);
        setSubmitting(false);
        return;
      }
      onCreated(json.service);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd sieci");
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
        aria-labelledby="quick-intake-title"
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
            id="quick-intake-title"
            className="text-sm font-semibold"
            style={{ color: "var(--text-main)" }}
          >
            Nowe zlecenie (szybkie)
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
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Lekki formularz przyjęcia — minimalne pola. Bez wizualnej
            kontroli 3D, bez podpisu klienta. Pełna ścieżka intake: panel
            sprzedawcy.
          </p>

          {/* Klient */}
          <div className="space-y-2">
            <p
              className="text-[11px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              Klient
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label htmlFor="qi-first" className="sr-only">
                  Imię
                </label>
                <input
                  id="qi-first"
                  ref={firstFocusRef}
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Imię *"
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
                <label htmlFor="qi-last" className="sr-only">
                  Nazwisko
                </label>
                <input
                  id="qi-last"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Nazwisko *"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label htmlFor="qi-phone" className="sr-only">
                  Telefon
                </label>
                <input
                  id="qi-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Telefon *"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                  autoComplete="tel"
                />
              </div>
              <div>
                <label htmlFor="qi-email" className="sr-only">
                  E-mail
                </label>
                <input
                  id="qi-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-mail (opcjonalnie)"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                  autoComplete="email"
                />
              </div>
            </div>
          </div>

          {/* Urządzenie */}
          <div className="space-y-2">
            <p
              className="text-[11px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              Urządzenie
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label htmlFor="qi-brand" className="sr-only">
                  Marka
                </label>
                <input
                  id="qi-brand"
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Marka *"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                />
              </div>
              <div>
                <label htmlFor="qi-model" className="sr-only">
                  Model
                </label>
                <input
                  id="qi-model"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Model *"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                />
              </div>
            </div>
            <div>
              <label htmlFor="qi-imei" className="sr-only">
                IMEI
              </label>
              <input
                id="qi-imei"
                type="text"
                value={imei}
                onChange={(e) => setImei(e.target.value)}
                placeholder="IMEI (15 cyfr, opcjonalnie)"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              />
            </div>
          </div>

          {/* Lokacja + opis */}
          {availableLocations.length > 1 && (
            <div>
              <label
                htmlFor="qi-location"
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Lokalizacja
              </label>
              <select
                id="qi-location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              >
                {availableLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label
              htmlFor="qi-description"
              className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Opis usterki
            </label>
            <textarea
              id="qi-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Co zgłasza klient (opcjonalnie)…"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-y"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
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
            Utwórz zlecenie
          </button>
        </div>
      </div>
    </div>
  );
}
