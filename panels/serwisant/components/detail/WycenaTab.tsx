"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Download,
  FileSignature,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { ServiceTicket } from "../tabs/ServicesBoard";
import { AnnexBuilder } from "../features/AnnexBuilder";

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
  const [requiresAnnex, setRequiresAnnex] = useState(false);
  const [acceptanceMethod, setAcceptanceMethod] = useState<
    "phone" | "email" | "documenso"
  >("phone");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [annexBuilderOpen, setAnnexBuilderOpen] = useState(false);
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
    // Wave 19/Phase 1D — TODO subscribe `/api/events?serviceId=...` (SSE)
    // i refreshować na eventy `action_logged` z payload.action
    // `annex_created`/`annex_accepted`/`annex_rejected`. Backend bus
    // (`lib/sse-bus.ts`) już publishuje, ale `/api/events` endpoint i
    // hook `useSseEvents` jeszcze nie istnieją w repo.
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
    try {
      const body: Record<string, unknown> = {
        newAmount: Number(amt.toFixed(2)),
        reason: reason.trim() || undefined,
        requiresAnnex,
      };
      if (requiresAnnex) body.acceptanceMethod = acceptanceMethod;
      const res = await fetch(
        `/api/relay/services/${service.id}/quote-update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { error?: string; ok?: boolean }
        | null;
      if (!res.ok) {
        setError(json?.error ?? `Błąd zapisu (HTTP ${res.status})`);
        return;
      }
      setSuccess(
        requiresAnnex
          ? "Aneks utworzony — czeka na akceptację klienta."
          : "Wycena zaktualizowana.",
      );
      setReason("");
      // Refresh service + history.
      void fetch(`/api/relay/services/${service.id}`)
        .then((r) => r.json())
        .then((j: { service?: ServiceTicket }) => {
          if (j?.service) onUpdate(j.service);
        })
        .catch(() => undefined);
      refresh();
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
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={requiresAnnex}
              onChange={(e) => setRequiresAnnex(e.target.checked)}
            />
            <span>Wymaga aneksu (zmiana po akceptacji klienta)</span>
          </label>
          {requiresAnnex && (
            <label className="block">
              <span
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Metoda akceptacji aneksu
              </span>
              <select
                value={acceptanceMethod}
                onChange={(e) =>
                  setAcceptanceMethod(
                    e.target.value as "phone" | "email" | "documenso",
                  )
                }
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              >
                <option value="phone">Telefonicznie</option>
                <option value="email">E-mailowo</option>
                <option value="documenso">Documenso (e-podpis)</option>
              </select>
            </label>
          )}

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
                  <th className="py-1.5 pr-3">Wartość</th>
                  <th className="py-1.5 pr-3">Delta</th>
                  <th className="py-1.5 pr-3">Powód</th>
                  <th className="py-1.5">Autor</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr
                    key={h.id}
                    className="border-t"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {new Date(h.changedAt).toLocaleString("pl-PL")}
                    </td>
                    <td className="py-1.5 pr-3 font-mono">
                      {formatPLN(h.newAmount)}
                    </td>
                    <td
                      className="py-1.5 pr-3 font-mono"
                      style={{
                        color:
                          (h.delta ?? 0) > 0
                            ? "#ef4444"
                            : (h.delta ?? 0) < 0
                              ? "#22c55e"
                              : "var(--text-muted)",
                      }}
                    >
                      {h.delta != null
                        ? `${h.delta > 0 ? "+" : ""}${h.delta.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="py-1.5 pr-3">{h.reason ?? "—"}</td>
                    <td className="py-1.5">
                      {h.changedByName ?? h.changedByEmail ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Aneksy">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={() => setAnnexBuilderOpen(true)}
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
            {annexes.map((a) => (
              <AnnexCard
                key={a.id}
                annex={a}
                onDownload={() => downloadAnnexPdf(a.id)}
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
            ))}
          </ul>
        )}
      </Section>

      {annexBuilderOpen && (
        <AnnexBuilder
          serviceId={service.id}
          currentAmount={service.amountEstimate ?? 0}
          customerEmail={service.contactEmail ?? undefined}
          customerPhone={service.contactPhone ?? undefined}
          onClose={() => setAnnexBuilderOpen(false)}
          onCreated={() => {
            setAnnexBuilderOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AnnexCard({
  annex,
  onDownload,
  onResend,
  resending,
  resendOk,
}: {
  annex: ServiceAnnex;
  onDownload: () => void;
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
          <div className="flex items-center gap-1.5">
            <span style={{ color: meta.color }}>{meta.icon}</span>
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--text-main)" }}
            >
              Δ {annex.deltaAmount.toFixed(2)} PLN
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
