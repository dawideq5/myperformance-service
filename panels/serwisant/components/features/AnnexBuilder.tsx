"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  FileSignature,
  Loader2,
  Mail,
  Phone,
  Search,
  X,
} from "lucide-react";
import type {
  AnnexAcceptanceMethod,
  PostalEmailMessage,
  ServiceAnnex,
} from "@/lib/serwisant/types";

interface AnnexBuilderProps {
  serviceId: string;
  currentAmount: number;
  customerEmail?: string;
  customerPhone?: string;
  onCreated?: (annex: ServiceAnnex) => void;
  onClose?: () => void;
}

interface ApiError {
  error?: string;
  detail?: string;
}

/**
 * 3-trybowy builder aneksu — Documenso (e-podpis), telefoniczna,
 * mailowa. Komponent jest standalone — kontroluje cały flow request →
 * response, errory pokazuje inline. Phase 3 zintegruje go z
 * `WycenaTab` (placeholder `data-todo="annex-builder"`).
 *
 * Zachowanie backendu (Phase 1 audit):
 *  - `POST /annex` z `acceptanceMethod=documenso` od razu wysyła do
 *    podpisu (auto-sign jako pracownik) — single call.
 *  - `POST /annex` z `phone`/`email` zawsze tworzy aneks w stanie
 *    `pending` → potem `POST /annexes/[annexId]/accept` żeby applyować
 *    delta i wpisać quote-history. Implementujemy 2-step.
 */
export function AnnexBuilder({
  serviceId,
  currentAmount,
  customerEmail,
  customerPhone,
  onCreated,
  onClose,
}: AnnexBuilderProps) {
  const [method, setMethod] = useState<AnnexAcceptanceMethod>(
    customerEmail ? "documenso" : "phone",
  );
  const [deltaInput, setDeltaInput] = useState<string>("0");
  const [reason, setReason] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [messageId, setMessageId] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lookup wiadomości — pomocnik dla metody mailowej
  const [showLookup, setShowLookup] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupMessages, setLookupMessages] = useState<PostalEmailMessage[]>(
    [],
  );

  const documensoDisabled = !customerEmail;

  // Lock body scroll while modal open + ESC closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const deltaParsed = useMemo(() => {
    const trimmed = deltaInput.trim().replace(",", ".");
    if (trimmed === "" || trimmed === "-" || trimmed === "+") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }, [deltaInput]);

  const newAmount = useMemo(() => {
    if (deltaParsed == null) return null;
    return Math.round((currentAmount + deltaParsed) * 100) / 100;
  }, [currentAmount, deltaParsed]);

  const reasonValid = reason.trim().length >= 4;
  const deltaValid = deltaParsed != null && deltaParsed !== 0;

  const phoneValid =
    method !== "phone" || (customerName.trim().length > 0 && note.trim().length > 0);
  const emailValid =
    method !== "email" || messageId.trim().length > 0;
  const documensoValid = method !== "documenso" || !!customerEmail;

  const canSubmit =
    deltaValid &&
    reasonValid &&
    phoneValid &&
    emailValid &&
    documensoValid &&
    !submitting;

  const fetchLookup = async () => {
    setLookupLoading(true);
    setLookupError(null);
    try {
      const res = await fetch(
        `/api/relay/services/${encodeURIComponent(serviceId)}/communication`,
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          (json as ApiError)?.error ?? `HTTP ${res.status}`,
        );
      }
      setLookupMessages(
        Array.isArray(json?.email)
          ? (json.email as PostalEmailMessage[])
          : [],
      );
    } catch (err) {
      setLookupError(
        err instanceof Error ? err.message : "Nie udało się pobrać wiadomości",
      );
    } finally {
      setLookupLoading(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const createBody: Record<string, unknown> = {
        deltaAmount: deltaParsed,
        reason: reason.trim(),
        acceptanceMethod: method,
      };
      if (method === "phone") {
        createBody.customerName = customerName.trim();
        createBody.note = note.trim();
      }
      if (method === "email") {
        createBody.messageId = messageId.trim();
        if (note.trim()) createBody.note = note.trim();
      }

      const createRes = await fetch(
        `/api/relay/services/${encodeURIComponent(serviceId)}/annex`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createBody),
        },
      );
      const createJson = (await createRes.json()) as
        | { ok?: boolean; annex?: ServiceAnnex; error?: string; detail?: string }
        | null;
      if (!createRes.ok || !createJson?.annex) {
        throw new Error(
          createJson?.error ?? `HTTP ${createRes.status}`,
        );
      }

      let finalAnnex: ServiceAnnex = createJson.annex;

      // 2-step: phone/email → auto accept
      if (method === "phone" || method === "email") {
        const acceptRes = await fetch(
          `/api/relay/services/${encodeURIComponent(
            serviceId,
          )}/annexes/${encodeURIComponent(finalAnnex.id)}/accept`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              method,
              note:
                note.trim() ||
                (method === "phone"
                  ? `Akceptacja telefoniczna od ${customerName.trim()}`
                  : `Akceptacja mailowa (messageId=${messageId.trim()})`),
              ...(method === "email" && messageId.trim()
                ? { messageId: messageId.trim() }
                : {}),
            }),
          },
        );
        const acceptJson = (await acceptRes.json()) as
          | { ok?: boolean; annex?: ServiceAnnex; error?: string }
          | null;
        if (!acceptRes.ok || !acceptJson?.annex) {
          throw new Error(
            acceptJson?.error ??
              `HTTP ${acceptRes.status} przy akceptacji aneksu`,
          );
        }
        finalAnnex = acceptJson.annex;
      }

      onCreated?.(finalAnnex);
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nieznany błąd");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="annex-builder-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="w-full max-w-lg max-h-[92vh] rounded-2xl border overflow-hidden flex flex-col"
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
          <h2 id="annex-builder-title" className="text-base font-semibold">
            Stwórz aneks do zlecenia
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg"
            style={{ color: "var(--text-muted)" }}
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Delta + reason */}
          <div className="space-y-3">
            <label className="block">
              <span
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Kwota delta (PLN)
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={deltaInput}
                onChange={(e) => setDeltaInput(e.target.value)}
                placeholder="np. +150,00 lub -50"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
                aria-describedby="annex-amount-preview"
              />
              <p
                id="annex-amount-preview"
                className="mt-1 text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                Aktualna kwota: {currentAmount.toFixed(2)} PLN
                {newAmount != null && (
                  <>
                    {" → "}
                    <span
                      className="font-semibold"
                      style={{
                        color:
                          deltaParsed != null && deltaParsed >= 0
                            ? "#22c55e"
                            : "#ef4444",
                      }}
                    >
                      {newAmount.toFixed(2)} PLN
                    </span>
                  </>
                )}
              </p>
            </label>

            <label className="block">
              <span
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Powód aneksu
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="np. Wymiana baterii — wykryto spuchnięcie, dodatkowy koszt 80 PLN"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              />
            </label>
          </div>

          {/* Method tabs */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div
              className="px-3 py-2 border-b text-[11px] uppercase tracking-wider font-semibold"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              Metoda akceptacji
            </div>
            <div
              role="tablist"
              aria-label="Metoda akceptacji aneksu"
              className="grid grid-cols-3"
            >
              <MethodTab
                id="documenso"
                active={method === "documenso"}
                disabled={documensoDisabled}
                icon={<FileSignature className="w-4 h-4" />}
                label="Elektroniczna"
                hint={
                  documensoDisabled
                    ? "Wymaga emaila klienta"
                    : "Documenso e-podpis"
                }
                onSelect={() => setMethod("documenso")}
              />
              <MethodTab
                id="phone"
                active={method === "phone"}
                icon={<Phone className="w-4 h-4" />}
                label="Telefoniczna"
                hint={customerPhone ?? "Bez numeru"}
                onSelect={() => setMethod("phone")}
              />
              <MethodTab
                id="email"
                active={method === "email"}
                icon={<Mail className="w-4 h-4" />}
                label="Mailowa"
                hint={customerEmail ?? "Bez emaila"}
                onSelect={() => setMethod("email")}
              />
            </div>

            {/* Method body */}
            <div className="p-4 space-y-3">
              {method === "documenso" && (
                <p
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Aneks zostanie wygenerowany jako PDF i wysłany do podpisu na{" "}
                  <span className="font-mono" style={{ color: "var(--text-main)" }}>
                    {customerEmail ?? "—"}
                  </span>
                  . Klient otrzyma link Documenso w mailu.
                </p>
              )}

              {method === "phone" && (
                <>
                  <label className="block">
                    <span
                      className="block text-xs font-medium mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Kto zaakceptował (imię i nazwisko klienta) <span style={{ color: "#ef4444" }}>*</span>
                    </span>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Jan Kowalski"
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                      style={{
                        background: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-main)",
                      }}
                    />
                  </label>
                  <label className="block">
                    <span
                      className="block text-xs font-medium mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Kontekst rozmowy <span style={{ color: "#ef4444" }}>*</span>
                    </span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="np. Rozmowa 12.05.2026 14:23 — klient potwierdził dodatkowy koszt baterii."
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                      style={{
                        background: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-main)",
                      }}
                    />
                  </label>
                </>
              )}

              {method === "email" && (
                <>
                  <label className="block">
                    <span
                      className="block text-xs font-medium mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Postal Message ID <span style={{ color: "#ef4444" }}>*</span>
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={messageId}
                        onChange={(e) => setMessageId(e.target.value)}
                        placeholder="np. 12345"
                        className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none font-mono"
                        style={{
                          background: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-main)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!showLookup) {
                            setShowLookup(true);
                            void fetchLookup();
                          } else {
                            setShowLookup(false);
                          }
                        }}
                        className="px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5"
                        style={{
                          background: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-main)",
                        }}
                      >
                        <Search className="w-3.5 h-3.5" />
                        {showLookup ? "Ukryj" : "Pokaż wiadomości"}
                      </button>
                    </div>
                  </label>

                  {showLookup && (
                    <div
                      className="rounded-lg border p-2 max-h-48 overflow-y-auto space-y-1"
                      style={{
                        background: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      {lookupLoading && (
                        <div
                          className="flex items-center gap-2 text-xs p-2"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Pobieranie wiadomości…
                        </div>
                      )}
                      {!lookupLoading && lookupError && (
                        <p className="text-xs p-2" style={{ color: "#ef4444" }}>
                          {lookupError}
                        </p>
                      )}
                      {!lookupLoading &&
                        !lookupError &&
                        lookupMessages.length === 0 && (
                          <p
                            className="text-xs p-2"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Brak wiadomości dla tego klienta.
                          </p>
                        )}
                      {!lookupLoading &&
                        lookupMessages.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setMessageId(String(m.id))}
                            className="w-full text-left p-2 rounded-md text-xs hover:bg-black/20 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono" style={{ color: "var(--text-muted)" }}>
                                #{m.id}
                              </span>
                              <span
                                className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded"
                                style={{
                                  background: "rgba(99,102,241,0.1)",
                                  color: "var(--accent)",
                                }}
                              >
                                {m.status}
                              </span>
                            </div>
                            <p
                              className="truncate"
                              style={{ color: "var(--text-main)" }}
                            >
                              {m.subject || "(bez tematu)"}
                            </p>
                            <p
                              className="text-[10px]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {new Date(m.timestamp * 1000).toLocaleString("pl-PL")}
                            </p>
                          </button>
                        ))}
                    </div>
                  )}

                  <label className="block">
                    <span
                      className="block text-xs font-medium mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Notatka kontekstowa (opcjonalna)
                    </span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="np. Klient odpisał potwierdzeniem 14.05.2026"
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                      style={{
                        background: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-main)",
                      }}
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg flex items-start gap-2 text-sm"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                color: "#fca5a5",
              }}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3 border-t"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium border"
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
            className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Stwórz aneks
          </button>
        </div>
      </div>
    </div>
  );
}

function MethodTab({
  id,
  active,
  disabled,
  icon,
  label,
  hint,
  onSelect,
}: {
  id: string;
  active: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={`annex-method-${id}`}
      disabled={disabled}
      onClick={onSelect}
      className="px-3 py-2.5 text-left flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      style={{
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#fff" : "var(--text-main)",
        borderRight: "1px solid var(--border-subtle)",
      }}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        {icon}
        {label}
      </span>
      <span
        className="text-[10px] truncate"
        style={{
          color: active ? "rgba(255,255,255,0.75)" : "var(--text-muted)",
        }}
      >
        {hint}
      </span>
    </button>
  );
}
