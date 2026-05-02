"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Eye,
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
 * Wave 19/Faza 1E — uproszczony 3-trybowy builder aneksu.
 *
 * Smart defaults:
 *  - method: documenso gdy email klienta istnieje, inaczej phone (jeśli
 *    telefon jest), inaczej email (manual lookup po messageId).
 *  - delta: 0,00 PLN start.
 *  - reason chips: szybkie wstawienie typowych powodów (bateria/wyświetlacz
 *    /dodatkowa diagnostyka). User może edytować free text.
 *
 * UX:
 *  - Kompaktowy segmented control z ikonami zamiast verbose radio.
 *  - Pokazuje tylko relevant pola dla wybranej metody.
 *  - Preview PDF — otwiera nową kartę z `/annex/preview` (server render
 *    on-the-fly, bez zapisu w DB).
 *  - Inline confirmation card po sukcesie zamiast generic toast (parent
 *    `WycenaTab` pokazuje status w liście aneksów).
 *
 * Real-time:
 *  - SSE bus (`lib/sse-bus.ts`) PUBLISHES eventy `action_logged` z
 *    payload.action `annex_created/accepted/rejected`. Front-end subscriber
 *    `/api/events` jeszcze nie istnieje (Wave 19/Phase 1D ma backend bus,
 *    `/api/events` endpoint i `useSseEvents` hook są TODO). Po dostarczeniu:
 *    parent `WycenaTab` zasubskrybuje `service:${serviceId}` i automatycznie
 *    refresh-uje listy aneksów.
 *
 * Backend kontrakt (Phase 1 audit):
 *  - `POST /annex` z `acceptanceMethod=documenso` od razu wysyła do podpisu
 *    (auto-sign jako pracownik) — single call.
 *  - `POST /annex` z `phone`/`email` zawsze tworzy aneks w stanie `pending`
 *    → potem `POST /annexes/[annexId]/accept` żeby applyować delta i wpisać
 *    quote-history. Implementujemy 2-step.
 */

const REASON_SUGGESTIONS = [
  "Dodatkowa wymiana baterii",
  "Naprawa skomplikowana niż początkowa diagnoza",
  "Wymiana wyświetlacza zamiast samego digitizera",
  "Wykryto zalanie — czyszczenie ultradźwiękowe",
  "Wymiana złącza ładowania",
  "Dodatkowa diagnostyka (czas pracy)",
];

export function AnnexBuilder({
  serviceId,
  currentAmount,
  customerEmail,
  customerPhone,
  onCreated,
  onClose,
}: AnnexBuilderProps) {
  const initialMethod: AnnexAcceptanceMethod = customerEmail
    ? "documenso"
    : customerPhone
      ? "phone"
      : "email";

  const [method, setMethod] = useState<AnnexAcceptanceMethod>(initialMethod);
  const [deltaInput, setDeltaInput] = useState<string>("0,00");
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
  const emailValid = method !== "email" || messageId.trim().length > 0;
  const documensoValid = method !== "documenso" || !!customerEmail;

  const canSubmit =
    deltaValid &&
    reasonValid &&
    phoneValid &&
    emailValid &&
    documensoValid &&
    !submitting;

  const canPreview = deltaValid && reasonValid;

  const fetchLookup = async () => {
    setLookupLoading(true);
    setLookupError(null);
    try {
      const res = await fetch(
        `/api/relay/services/${encodeURIComponent(serviceId)}/communication`,
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error((json as ApiError)?.error ?? `HTTP ${res.status}`);
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

  const openPreview = () => {
    if (!canPreview) return;
    const params = new URLSearchParams();
    params.set("delta", String(deltaParsed));
    params.set("reason", reason.trim());
    if (method === "phone" && customerName.trim()) {
      params.set("customerName", customerName.trim());
    }
    const url = `/api/relay/services/${encodeURIComponent(
      serviceId,
    )}/annex/preview?${params.toString()}`;
    window.open(url, "_blank", "noopener,noreferrer");
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
        throw new Error(createJson?.error ?? `HTTP ${createRes.status}`);
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
                aria-describedby="annex-reason-help annex-reason-suggestions"
              />
              <p
                id="annex-reason-help"
                className="mt-1 text-[10px]"
                style={{ color: "var(--text-muted)" }}
              >
                Min. 4 znaki. Kliknij chip żeby wstawić typowy powód.
              </p>
              <div
                id="annex-reason-suggestions"
                className="mt-2 flex flex-wrap gap-1.5"
                aria-label="Typowe powody aneksu"
              >
                {REASON_SUGGESTIONS.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setReason(s)}
                    className="px-2 py-1 rounded-md text-[10px] border transition-colors hover:bg-black/10"
                    style={{
                      background: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-main)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </label>
          </div>

          {/* Method segmented control */}
          <div>
            <span
              id="annex-method-label"
              className="block text-[11px] uppercase tracking-wider font-semibold mb-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              Metoda akceptacji
            </span>
            <div
              role="radiogroup"
              aria-labelledby="annex-method-label"
              className="grid grid-cols-3 gap-1 p-1 rounded-xl border"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <SegmentedButton
                active={method === "documenso"}
                disabled={documensoDisabled}
                icon={<FileSignature className="w-3.5 h-3.5" />}
                label="E-podpis"
                title={
                  documensoDisabled
                    ? "Wymaga e-maila klienta"
                    : `Documenso → ${customerEmail}`
                }
                onSelect={() => setMethod("documenso")}
              />
              <SegmentedButton
                active={method === "phone"}
                icon={<Phone className="w-3.5 h-3.5" />}
                label="Telefon"
                title={customerPhone ?? "Bez numeru"}
                onSelect={() => setMethod("phone")}
              />
              <SegmentedButton
                active={method === "email"}
                icon={<Mail className="w-3.5 h-3.5" />}
                label="E-mail"
                title={customerEmail ?? "Manual messageId"}
                onSelect={() => setMethod("email")}
              />
            </div>

            {/* Method body */}
            <div
              className="mt-2 rounded-xl border p-3 space-y-3"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              {method === "documenso" && (
                <p
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Aneks zostanie wygenerowany jako PDF i wysłany do podpisu na{" "}
                  <span
                    className="font-mono"
                    style={{ color: "var(--text-main)" }}
                  >
                    {customerEmail ?? "—"}
                  </span>
                  . Klient otrzyma link Documenso w mailu, a Ty natychmiast
                  zobaczysz status w sekcji „Aneksy” gdy podpisze.
                </p>
              )}

              {method === "phone" && (
                <>
                  <label className="block">
                    <span
                      className="block text-xs font-medium mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Kto zaakceptował (imię i nazwisko klienta){" "}
                      <span style={{ color: "#ef4444" }}>*</span>
                    </span>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Jan Kowalski"
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                      style={{
                        background: "var(--bg-card)",
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
                      Kontekst rozmowy{" "}
                      <span style={{ color: "#ef4444" }}>*</span>
                    </span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="np. Rozmowa 12.05.2026 14:23 — klient potwierdził dodatkowy koszt baterii."
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                      style={{
                        background: "var(--bg-card)",
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
                      Postal Message ID{" "}
                      <span style={{ color: "#ef4444" }}>*</span>
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={messageId}
                        onChange={(e) => setMessageId(e.target.value)}
                        placeholder="np. 12345"
                        className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none font-mono"
                        style={{
                          background: "var(--bg-card)",
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
                          background: "var(--bg-card)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-main)",
                        }}
                        aria-expanded={showLookup}
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
                        background: "var(--bg-card)",
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
                        <p
                          className="text-xs p-2"
                          style={{ color: "#ef4444" }}
                        >
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
                              <span
                                className="font-mono"
                                style={{ color: "var(--text-muted)" }}
                              >
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
                              {new Date(m.timestamp * 1000).toLocaleString(
                                "pl-PL",
                              )}
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
                        background: "var(--bg-card)",
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
          className="flex items-center justify-between gap-2 px-5 py-3 border-t"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <button
            type="button"
            onClick={openPreview}
            disabled={!canPreview || submitting}
            className="px-3 py-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
            title={
              canPreview
                ? "Otwórz podgląd PDF w nowej karcie"
                : "Uzupełnij delta i powód, aby zobaczyć podgląd"
            }
          >
            <Eye className="w-3.5 h-3.5" />
            Podgląd PDF
          </button>
          <div className="flex items-center gap-2">
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
    </div>
  );
}

function SegmentedButton({
  active,
  disabled,
  icon,
  label,
  title,
  onSelect,
}: {
  active: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  title: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={`${label}: ${title}`}
      title={title}
      disabled={disabled}
      onClick={onSelect}
      className="px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      style={{
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#fff" : "var(--text-main)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
