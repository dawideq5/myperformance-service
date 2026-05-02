"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileSignature,
  Loader2,
  Printer,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { ServiceTicket } from "../tabs/ServicesBoard";
import { AnnexBuilder } from "../features/AnnexBuilder";
import { ComponentsSection } from "../features/ComponentsSection";
import { subscribeToService } from "@/lib/sse-client";

interface QuoteHistoryEntry {
  id: string;
  oldAmount: number | null;
  newAmount: number | null;
  delta: number | null;
  reason: string | null;
  changedByName: string | null;
  changedByEmail: string | null;
  changedAt: string;
}

interface ServiceAnnex {
  id: string;
  deltaAmount: number;
  reason: string;
  acceptanceMethod: string;
  acceptanceStatus: string;
  customerName: string | null;
  createdAt: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  documensoDocId?: number | null;
}

interface WycenaTabProps {
  service: ServiceTicket;
  onUpdate: (updated: ServiceTicket) => void;
  /** Generic realtime version counter z parent ServiceDetailView. Wave
   * 20: nieużywany — WycenaTab subskrybuje SSE samodzielnie przez
   * `subscribeToService(service.id)`. Pole zachowane wyłącznie dla
   * zgodności typu z istniejącym callerem (parent forwarduje counter
   * do wszystkich tabów). */
  realtimeVersion?: number;
}

interface SuggestedAnnex {
  previousAmount: number;
  newAmount: number;
  delta: number;
  reason: string;
}

function formatPLN(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(2)} PLN`;
}

const ACCEPTANCE_METHOD_LABEL: Record<string, string> = {
  documenso: "Documenso",
  phone: "Telefon",
  email: "E-mail",
};

const ACCEPTANCE_STATUS_LABEL: Record<string, string> = {
  pending: "Oczekuje",
  accepted: "Zaakceptowany",
  rejected: "Odrzucony",
  expired: "Unieważniony",
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function WycenaTab({ service, onUpdate }: WycenaTabProps) {
  const [history, setHistory] = useState<QuoteHistoryEntry[]>([]);
  const [annexes, setAnnexes] = useState<ServiceAnnex[]>([]);
  const [loading, setLoading] = useState(true);

  const [newAmount, setNewAmount] = useState(
    service.amountEstimate != null ? String(service.amountEstimate) : "",
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [annexBuilderOpen, setAnnexBuilderOpen] = useState(false);
  const [annexPrefill, setAnnexPrefill] = useState<SuggestedAnnex | null>(null);
  const [pendingAnnex, setPendingAnnex] = useState<SuggestedAnnex | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendOk, setResendOk] = useState<string | null>(null);

  useEffect(() => {
    setNewAmount(
      service.amountEstimate != null ? String(service.amountEstimate) : "",
    );
  }, [service.id, service.amountEstimate]);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/relay/services/${service.id}/quote-history`).then((r) =>
        r.json(),
      ),
      fetch(`/api/relay/services/${service.id}/annexes`).then((r) => r.json()),
    ])
      .then(
        ([h, a]: [
          { entries?: QuoteHistoryEntry[] },
          { annexes?: ServiceAnnex[] },
        ]) => {
          setHistory(h?.entries ?? []);
          setAnnexes(a?.annexes ?? []);
        },
      )
      .catch(() => {
        setHistory([]);
        setAnnexes([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // Wave 20 / Faza 1A — real-time SSE: refresh listy aneksów + historii
    // gdy backend opublikuje annex_created/accepted/rejected. Documenso
    // webhook wewnątrz dashboardu wywołuje `publish({ type: "annex_accepted" })`
    // i ten subscriber reaktywnie odświeża widok bez polling-u.
    const unsub = subscribeToService(service.id, (e) => {
      if (
        e.type === "annex_created" ||
        e.type === "annex_accepted" ||
        e.type === "annex_rejected" ||
        e.type === "annex_completed" ||
        e.type === "service_updated"
      ) {
        refresh();
        // Service update może zmienić amountEstimate — pull fresh service.
        if (e.type === "annex_accepted" || e.type === "service_updated") {
          void fetch(`/api/relay/services/${service.id}`)
            .then((r) => r.json())
            .then((j: { service?: ServiceTicket }) => {
              if (j?.service) onUpdate(j.service);
            })
            .catch(() => undefined);
        }
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id]);

  const submit = async () => {
    const amt = Number(newAmount);
    if (!Number.isFinite(amt) || amt < 0) {
      setError("Podaj poprawną nieujemną wartość PLN.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setPendingAnnex(null);
    try {
      const oldAmount =
        typeof service.amountEstimate === "number"
          ? service.amountEstimate
          : 0;
      const targetAmount = Number(amt.toFixed(2));
      const body: Record<string, unknown> = {
        newAmount: targetAmount,
        reason: reason.trim() || undefined,
      };
      const res = await fetch(
        `/api/relay/services/${service.id}/quote-update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | {
            error?: string;
            ok?: boolean;
            requiresAnnexConfirmation?: boolean;
            suggestedAnnex?: SuggestedAnnex | null;
          }
        | null;
      if (!res.ok) {
        setError(json?.error ?? `Błąd zapisu (HTTP ${res.status})`);
        return;
      }
      setSuccess("Wycena zaktualizowana.");
      // Refresh service + history.
      void fetch(`/api/relay/services/${service.id}`)
        .then((r) => r.json())
        .then((j: { service?: ServiceTicket }) => {
          if (j?.service) onUpdate(j.service);
        })
        .catch(() => undefined);
      refresh();

      const suggestion =
        json?.suggestedAnnex ??
        (json?.requiresAnnexConfirmation
          ? {
              previousAmount: oldAmount,
              newAmount: targetAmount,
              delta: Number((targetAmount - oldAmount).toFixed(2)),
              reason: reason.trim(),
            }
          : null);
      if (suggestion) {
        setPendingAnnex(suggestion);
      }
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd sieci");
    } finally {
      setSubmitting(false);
    }
  };

  const downloadAnnexPdf = (annexId: string) => {
    const url = `/api/relay/services/${encodeURIComponent(
      service.id,
    )}/annexes/${encodeURIComponent(annexId)}/pdf`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const printAnnex = (annexId: string) => {
    const url = `/api/relay/services/${encodeURIComponent(
      service.id,
    )}/annexes/${encodeURIComponent(annexId)}/print`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const resendAnnexReminder = async (annexId: string) => {
    setResendingId(annexId);
    setResendError(null);
    setResendOk(null);
    try {
      const res = await fetch(
        `/api/relay/services/${encodeURIComponent(
          service.id,
        )}/annexes/${encodeURIComponent(annexId)}/resend`,
        { method: "POST" },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setResendOk(annexId);
      setTimeout(() => setResendOk(null), 4000);
    } catch (err) {
      setResendError(
        err instanceof Error
          ? err.message
          : "Nie udało się wysłać przypomnienia",
      );
      setTimeout(() => setResendError(null), 5000);
    } finally {
      setResendingId(null);
    }
  };

  const openAnnexBuilder = (suggestion: SuggestedAnnex) => {
    setAnnexPrefill(suggestion);
    setAnnexBuilderOpen(true);
    setPendingAnnex(null);
  };

  return (
    <div className="space-y-4">
      <Section title="Aktualna wycena">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold">
            {formatPLN(service.amountEstimate)}
          </span>
          {service.amountFinal != null && (
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              (końcowa: {formatPLN(service.amountFinal)})
            </span>
          )}
        </div>
      </Section>

      <Section title="Aktualizacja wyceny">
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Nowa kwota (PLN)
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
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
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Powód zmiany
              </span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
                placeholder="np. dodatkowa wymiana baterii"
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Zaktualizuj wycenę
            </button>
            {success && (
              <span className="text-[11px]" style={{ color: "#22c55e" }}>
                {success}
              </span>
            )}
            {error && (
              <span className="text-[11px]" style={{ color: "#ef4444" }}>
                {error}
              </span>
            )}
          </div>

          {pendingAnnex && (
            <div
              className="mt-3 p-3 rounded-xl border flex items-start gap-3"
              style={{
                background: "rgba(245,158,11,0.08)",
                borderColor: "rgba(245,158,11,0.45)",
              }}
              role="status"
            >
              <AlertTriangle
                className="w-5 h-5 flex-shrink-0 mt-0.5"
                style={{ color: "#f59e0b" }}
              />
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-main)" }}
                >
                  Zmiana wyceny — prześlij klientowi aneks
                </p>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Wycena{" "}
                  <span
                    style={{
                      color: pendingAnnex.delta > 0 ? "#10b981" : "#f59e0b",
                      fontWeight: 600,
                    }}
                  >
                    {pendingAnnex.delta > 0 ? "zwiększona" : "obniżona"}
                  </span>{" "}
                  z {pendingAnnex.previousAmount.toFixed(2)} PLN do{" "}
                  {pendingAnnex.newAmount.toFixed(2)} PLN.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openAnnexBuilder(pendingAnnex)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    <FileSignature className="w-3.5 h-3.5" />
                    Wyślij aneks teraz
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingAnnex(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border"
                    style={{
                      background: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-main)",
                    }}
                  >
                    Pomiń
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Historia wyceny">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2
              className="w-4 h-4 animate-spin"
              style={{ color: "var(--text-muted)" }}
            />
          </div>
        ) : history.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Brak wpisów w historii wyceny.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr
                  style={{ color: "var(--text-muted)" }}
                  className="text-left text-[10px] uppercase tracking-wider"
                >
                  <th className="py-1.5 pr-3">Data</th>
                  <th className="py-1.5 pr-3">Zmiana</th>
                  <th className="py-1.5 pr-3">Powód</th>
                  <th className="py-1.5">Autor</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  // Wave 21 / Faza 1E — opisowa zmiana zamiast Δ.
                  const oldA = h.oldAmount;
                  const newA = h.newAmount;
                  const delta = h.delta ?? 0;
                  const verb =
                    delta > 0
                      ? "zwiększona"
                      : delta < 0
                        ? "obniżona"
                        : "bez zmian";
                  const color =
                    delta > 0 ? "#10b981" : delta < 0 ? "#f59e0b" : "var(--text-muted)";
                  return (
                    <tr
                      key={h.id}
                      className="border-t"
                      style={{ borderColor: "var(--border-subtle)" }}
                    >
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {new Date(h.changedAt).toLocaleString("pl-PL")}
                      </td>
                      <td className="py-1.5 pr-3">
                        {oldA != null && newA != null ? (
                          <span>
                            Wycena{" "}
                            <span style={{ color, fontWeight: 600 }}>{verb}</span>{" "}
                            z{" "}
                            <span className="font-mono">{oldA.toFixed(2)} PLN</span>{" "}
                            do{" "}
                            <span className="font-mono">{newA.toFixed(2)} PLN</span>
                          </span>
                        ) : (
                          formatPLN(newA)
                        )}
                      </td>
                      <td className="py-1.5 pr-3">{h.reason ?? "—"}</td>
                      <td className="py-1.5">
                        {h.changedByName ?? h.changedByEmail ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Aneksy">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={() => {
              const previousAmount =
                typeof service.amountEstimate === "number"
                  ? service.amountEstimate
                  : 0;
              setAnnexPrefill({
                previousAmount,
                newAmount: previousAmount,
                delta: 0,
                reason: "",
              });
              setAnnexBuilderOpen(true);
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <FileSignature className="w-3.5 h-3.5" />
            Stwórz aneks
          </button>
        </div>
        {resendError && (
          <p className="text-[11px] mb-2" style={{ color: "#ef4444" }}>
            {resendError}
          </p>
        )}
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2
              className="w-4 h-4 animate-spin"
              style={{ color: "var(--text-muted)" }}
            />
          </div>
        ) : annexes.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Brak aneksów do tego zlecenia.
          </p>
        ) : (
          <ul className="space-y-2">
            {annexes.map((a) => {
              // Wave 21 / Faza 1E — derive previous/new amounts:
              //  - accepted: quote-history zawiera wpis z annexId, używamy go,
              //  - pending/rejected/expired: previous = aktualna wycena,
              //    new = previous + delta (projekcja, jeszcze nie zastosowana).
              const histEntry = history.find((h) => {
                // QuoteHistoryEntry interface above nie ma annexId, ale
                // payload zwracany z relay je posiada (Directus row).
                const raw = h as QuoteHistoryEntry & {
                  annexId?: string | null;
                };
                return raw.annexId === a.id;
              }) as (QuoteHistoryEntry & { annexId?: string | null }) | undefined;
              const baseAmount =
                typeof service.amountEstimate === "number"
                  ? service.amountEstimate
                  : 0;
              const previousAmount =
                a.acceptanceStatus === "accepted" && histEntry?.oldAmount != null
                  ? histEntry.oldAmount
                  : baseAmount;
              const newAmount =
                a.acceptanceStatus === "accepted" && histEntry?.newAmount != null
                  ? histEntry.newAmount
                  : Number((previousAmount + a.deltaAmount).toFixed(2));
              return (
                <AnnexCard
                  key={a.id}
                  annex={a}
                  previousAmount={previousAmount}
                  newAmount={newAmount}
                  onDownload={() => downloadAnnexPdf(a.id)}
                  onPrint={() => printAnnex(a.id)}
                  onResend={
                    a.acceptanceMethod === "documenso" &&
                    a.acceptanceStatus === "pending" &&
                    Date.now() - new Date(a.createdAt).getTime() > ONE_DAY_MS
                      ? () => void resendAnnexReminder(a.id)
                      : undefined
                  }
                  resending={resendingId === a.id}
                  resendOk={resendOk === a.id}
                />
              );
            })}
          </ul>
        )}
      </Section>

      <ComponentsSection
        serviceId={service.id}
        amountEstimate={service.amountEstimate}
      />

      {annexBuilderOpen && annexPrefill && (
        <AnnexBuilder
          serviceId={service.id}
          previousAmount={annexPrefill.previousAmount}
          newAmount={annexPrefill.newAmount}
          prefilledReason={annexPrefill.reason}
          customerEmail={service.contactEmail ?? undefined}
          customerPhone={service.contactPhone ?? undefined}
          onClose={() => {
            setAnnexBuilderOpen(false);
            setAnnexPrefill(null);
          }}
          onCreated={() => {
            setAnnexBuilderOpen(false);
            setAnnexPrefill(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AnnexCard({
  annex,
  previousAmount,
  newAmount,
  onDownload,
  onPrint,
  onResend,
  resending,
  resendOk,
}: {
  annex: ServiceAnnex;
  previousAmount: number;
  newAmount: number;
  onDownload: () => void;
  onPrint: () => void;
  onResend?: () => void;
  resending: boolean;
  resendOk: boolean;
}) {
  const status = annex.acceptanceStatus;
  const meta = useMemo(() => {
    if (status === "accepted") {
      return {
        icon: <CheckCircle2 className="w-4 h-4" />,
        color: "#22c55e",
        bg: "rgba(34,197,94,0.08)",
        border: "rgba(34,197,94,0.5)",
        animate: false,
      };
    }
    if (status === "rejected" || status === "expired") {
      return {
        icon: <XCircle className="w-4 h-4" />,
        color: "#ef4444",
        bg: "rgba(239,68,68,0.08)",
        border: "rgba(239,68,68,0.5)",
        animate: false,
      };
    }
    return {
      icon: <Clock className="w-4 h-4" />,
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.4)",
      animate: true,
    };
  }, [status]);

  return (
    <li
      className={`p-2.5 rounded-lg border ${meta.animate ? "annex-pulse" : ""}`}
      style={{
        background: meta.bg,
        borderColor: meta.border,
        borderWidth: 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span style={{ color: meta.color }}>{meta.icon}</span>
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--text-main)" }}
            >
              {/* Wave 21 / Faza 1E — human readable summary zamiast Δ. */}
              {annex.deltaAmount > 0
                ? "Wycena zwiększona"
                : annex.deltaAmount < 0
                  ? "Wycena obniżona"
                  : "Wycena bez zmian"}
              {annex.deltaAmount !== 0 && (
                <>
                  {" "}
                  z{" "}
                  <span className="font-mono">
                    {previousAmount.toFixed(2)} PLN
                  </span>{" "}
                  do{" "}
                  <span className="font-mono">{newAmount.toFixed(2)} PLN</span>
                </>
              )}
            </span>
            <span
              className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(0,0,0,0.15)",
                color: meta.color,
              }}
            >
              {ACCEPTANCE_STATUS_LABEL[status] ?? status}
            </span>
          </div>
          <p
            className="text-[11px] mt-1"
            style={{ color: "var(--text-muted)" }}
          >
            {annex.reason}
          </p>
          <p
            className="text-[10px] mt-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {ACCEPTANCE_METHOD_LABEL[annex.acceptanceMethod] ??
              annex.acceptanceMethod}
            {annex.customerName ? ` · ${annex.customerName}` : ""}
            {" · "}
            {new Date(annex.createdAt).toLocaleString("pl-PL", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={onDownload}
            className="px-2 py-1 rounded text-[10px] font-medium border flex items-center gap-1 transition-colors hover:bg-black/10"
            style={{
              background: "transparent",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
            title="Pobierz PDF aneksu"
          >
            <Download className="w-3 h-3" />
            PDF
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="px-2 py-1 rounded text-[10px] font-medium border flex items-center gap-1 transition-colors hover:bg-black/10"
            style={{
              background: "transparent",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
            title="Otwórz w trybie drukowania"
          >
            <Printer className="w-3 h-3" />
            Drukuj
          </button>
          {onResend && (
            <button
              type="button"
              onClick={onResend}
              disabled={resending || resendOk}
              className="px-2 py-1 rounded text-[10px] font-medium border flex items-center gap-1 transition-colors hover:bg-black/10 disabled:opacity-50"
              style={{
                background: "transparent",
                borderColor: "var(--border-subtle)",
                color: resendOk ? "#22c55e" : "var(--text-main)",
              }}
              title="Wyślij przypomnienie Documenso (>24h od wysłania)"
            >
              {resending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {resendOk ? "Wysłano" : "Przypomnij"}
            </button>
          )}
        </div>
      </div>
      <style jsx>{`
        @keyframes annex-pulse-anim {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.45);
          }
          50% {
            box-shadow: 0 0 0 6px rgba(245, 158, 11, 0);
          }
        }
        .annex-pulse {
          animation: annex-pulse-anim 2.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .annex-pulse {
            animation: none;
          }
        }
      `}</style>
    </li>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-3 rounded-xl border"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <h3
        className="text-[11px] uppercase tracking-wider font-semibold mb-2"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}
