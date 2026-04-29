"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Mail,
  Pen,
  Printer,
  Loader2,
  AlertCircle,
  Phone,
  AtSign,
  Tag,
  Wrench,
  Calendar,
  Clock,
  History,
  Send,
  Edit3,
} from "lucide-react";
import Link from "next/link";
import { ToastProvider, useToast } from "../ToastProvider";
import { sendElectronicReceipt, openServiceReceipt } from "../../lib/receipt";

interface ServiceDetail {
  id: string;
  ticketNumber: string;
  status: string;
  brand: string | null;
  model: string | null;
  imei: string | null;
  color: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  description: string | null;
  amountEstimate: number | null;
  createdAt: string | null;
  visualCondition?: {
    documenso?: {
      docId: number;
      status:
        | "sent"
        | "employee_signed"
        | "signed"
        | "rejected"
        | "expired";
      sentAt: string;
      employeeSignedAt?: string;
      completedAt?: string;
      previousDocIds?: number[];
      employeeSigningUrl?: string;
      signedPdfUrl?: string;
    };
    handover?: { choice: "none" | "items"; items: string };
  };
}

const DOCUMENSO_STATUS_PHRASES: Record<
  string,
  { label: string; color: string; description: string }
> = {
  sent: {
    label: "Oczekiwanie na podpis pracownika",
    color: "#06B6D4",
    description: "",
  },
  employee_signed: {
    label: "Oczekiwanie na podpis klienta",
    color: "#A855F7",
    description: "",
  },
  signed: {
    label: "Dokument zatwierdzony",
    color: "#22C55E",
    description: "",
  },
  rejected: {
    label: "Odrzucone przez klienta",
    color: "#EF4444",
    description: "",
  },
  expired: {
    label: "Unieważnione",
    color: "#F59E0B",
    description: "",
  },
};

interface Revision {
  id: string;
  summary: string;
  isSignificant: boolean;
  changeKind: string;
  editedByName: string | null;
  createdAt: string;
}

interface ServiceActionEntry {
  id: string;
  action: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
}

interface MailMessage {
  id: number;
  status: string;
  rcptTo: string;
  subject: string;
  timestamp: number;
  bounce?: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  received: { label: "Przyjęty", color: "#64748B" },
  diagnosing: { label: "Diagnoza", color: "#0EA5E9" },
  awaiting_quote: { label: "Wycena", color: "#F59E0B" },
  repairing: { label: "Naprawa", color: "#A855F7" },
  testing: { label: "Testy", color: "#06B6D4" },
  ready: { label: "Gotowy", color: "#22C55E" },
  delivered: { label: "Wydany", color: "#16A34A" },
  cancelled: { label: "Anulowany", color: "#EF4444" },
};

export function ServiceDetailView({
  serviceId,
  initialAction,
}: {
  serviceId: string;
  initialAction: string | null;
}) {
  return (
    <ToastProvider>
      <ServiceDetailInner serviceId={serviceId} initialAction={initialAction} />
    </ToastProvider>
  );
}

function ServiceDetailInner({
  serviceId,
  initialAction,
}: {
  serviceId: string;
  initialAction: string | null;
}) {
  const toast = useToast();
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [actions, setActions] = useState<ServiceActionEntry[]>([]);
  const [mailMessages, setMailMessages] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        fetch(`/api/relay/services/${serviceId}`),
        fetch(`/api/relay/services/${serviceId}/revisions`),
        fetch(`/api/relay/services/${serviceId}/actions`),
        fetch(`/api/relay/services/${serviceId}/mail-history`),
      ]);
      const j1 = await r1.json();
      const j2 = await r2.json();
      const j3 = await r3.json().catch(() => ({ actions: [] }));
      const j4 = await r4.json().catch(() => ({ messages: [] }));
      if (!r1.ok) throw new Error(j1?.error ?? `HTTP ${r1.status}`);
      const fetched = (j1.service ?? j1.data?.service) as ServiceDetail;
      // Handover z sessionStorage — przeniesiony z AddServiceTab po
      // create. Persiste'owany w visualCondition.handover (przez backend
      // przy create/edit), ale fresh transfer po create wyciągamy też
      // z session żeby PDF przy pierwszym otwarciu miał dane.
      try {
        const raw = sessionStorage.getItem(`mp_handover:${serviceId}`);
        if (raw && !fetched.visualCondition?.handover) {
          const ho = JSON.parse(raw) as {
            choice: "none" | "items";
            items: string;
          };
          fetched.visualCondition = {
            ...(fetched.visualCondition ?? {}),
            handover: ho,
          };
        }
      } catch {
        /* ignore */
      }
      setService(fetched);
      setRevisions((j2.revisions ?? []) as Revision[]);
      setActions((j3.actions ?? []) as ServiceActionEntry[]);
      setMailMessages((j4.messages ?? []) as MailMessage[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd pobierania");
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Polling 5s w aktywnym widoku — real-time tracking statusu Documenso.
  // Pause gdy tab nieaktywny + instant refresh przy focus.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    };
    const id = setInterval(tick, 5_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const eDocStatus = service?.visualCondition?.documenso?.status ?? "none";
  const employeeSigningUrl =
    service?.visualCondition?.documenso?.employeeSigningUrl;
  // Backend ustawia signedPdfUrl="available" gdy dokument podpisany —
  // panel-side budujemy URL do relay endpointa.
  const signedPdfUrl = service?.visualCondition?.documenso?.signedPdfUrl
    ? `/api/relay/services/${service.id}/signed-pdf`
    : undefined;

  // Auto-flow: gdy URL ma ?action=sign i potwierdzenie nie zostało
  // jeszcze wysłane do Documenso → wywołaj wysyłkę automatycznie.
  // Po wysyłce status zmieni się na "sent" + pojawi się signing URL
  // pracownika do otwarcia w iframe/nowej karcie.
  useEffect(() => {
    if (!service) return;
    if (initialAction === "sign" && eDocStatus === "none") {
      void handleEmail(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction, service?.id]);

  // Detect ?signed=employee w URL (po powrocie z Documenso po podpisie
  // pracownika) — toast confirmation + clean param + force refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const signed = params.get("signed");
    if (signed === "employee") {
      toast.push({
        kind: "success",
        title: "Podpis pracownika złożony",
        message: "Klient otrzyma email z prośbą o podpis.",
      });
      params.delete("signed");
      const newUrl =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", newUrl);
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrint = useCallback(() => {
    if (!service) return;
    openServiceReceipt(service.id, service.visualCondition?.handover);
  }, [service]);

  const handleEmail = useCallback(
    async (force = false) => {
      if (!service) return;
      setBusy(true);
      const toastId = toast.push({
        kind: "progress",
        title: force ? "Ponowna wysyłka" : "Wysyłka potwierdzenia",
        message: "Inicjalizacja…",
        sticky: true,
        progress: 5,
      });
      const stages = [
        { msg: "Generuję dokument PDF…", progress: 25, delay: 700 },
        { msg: "Tworzę dokument w Documenso…", progress: 55, delay: 2000 },
        { msg: "Wysyłam zaproszenie do podpisu…", progress: 85, delay: 4000 },
      ];
      const timers = stages.map((s) =>
        setTimeout(
          () => toast.update(toastId, { message: s.msg, progress: s.progress }),
          s.delay,
        ),
      );
      try {
        const r = await sendElectronicReceipt(
          service.id,
          service.visualCondition?.handover,
          force,
        );
        timers.forEach(clearTimeout);
        if (r.ok) {
          toast.update(toastId, {
            kind: "success",
            title: "Dokument przekazany do podpisu",
            message: "Otwieram panel podpisu pracownika.",
            sticky: false,
            progress: 100,
          });
          await refresh();
          // Auto-otwórz signing URL pracownika w nowej karcie. Documenso
          // hostowane na sign.zlecenieserwisowe.pl. Po podpisie redirect
          // wraca do panelu z ?signed=employee.
          const url = r.signingUrls?.[0]?.url;
          if (url) {
            window.open(url, "_blank", "noopener,noreferrer");
          }
        } else {
          toast.update(toastId, {
            kind: "error",
            title: "Błąd wysyłki",
            message: r.error ?? "Nieznany błąd",
            sticky: false,
            progress: undefined,
          });
        }
      } catch (e) {
        timers.forEach(clearTimeout);
        toast.update(toastId, {
          kind: "error",
          title: "Błąd",
          message: e instanceof Error ? e.message : "Nieznany błąd",
          sticky: false,
        });
      } finally {
        setBusy(false);
      }
    },
    [refresh, service, toast],
  );

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--bg-main)" }}
      >
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    );
  }

  if (error || !service) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: "var(--bg-main)" }}
      >
        <div
          className="max-w-md w-full p-6 rounded-2xl border text-center"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
        >
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-red-400" />
          <p className="font-semibold mb-2">Nie udało się pobrać zlecenia</p>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            {error ?? "Nieznany błąd"}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm"
            style={{ color: "var(--accent)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Powrót
          </Link>
        </div>
      </div>
    );
  }

  const status = STATUS_LABELS[service.status] ?? {
    label: service.status,
    color: "#64748B",
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg-main)" }}
    >
      <header
        className="border-b backdrop-blur-md sticky top-0 z-10"
        style={{
          background: "var(--bg-header)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex-shrink-0 p-2 rounded-lg flex items-center gap-2 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Lista zleceń</span>
          </Link>
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wide"
              style={{ background: status.color + "22", color: status.color }}
            >
              {status.label}
            </span>
            <p
              className="font-mono font-bold truncate"
              style={{ color: "var(--text-main)" }}
            >
              {service.ticketNumber}
            </p>
          </div>
          <span
            className="text-[10px] uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
            title="Status aktualizowany automatycznie"
          >
            • na żywo
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEWA — info + akcje */}
        <section className="lg:col-span-2 space-y-4">
          {eDocStatus !== "none" && eDocStatus !== "expired" && (
            <DocumentSigningCard
              status={eDocStatus}
              signedPdfUrl={signedPdfUrl}
              employeeSigningUrl={employeeSigningUrl}
            />
          )}

          <ActionsCard
            eDocStatus={eDocStatus}
            hasEmail={!!service.contactEmail}
            busy={busy}
            onPrint={handlePrint}
            onEmail={() => void handleEmail(false)}
            onResend={() => void handleEmail(true)}
            signedPdfUrl={signedPdfUrl}
          />

          <Card icon={<Wrench className="w-4 h-4" />} title="Urządzenie">
            <Row label="Marka" value={service.brand} />
            <Row label="Model" value={service.model} />
            <Row label="IMEI" value={service.imei} mono />
            <Row label="Kolor" value={service.color} />
          </Card>

          <Card icon={<Phone className="w-4 h-4" />} title="Klient">
            <Row
              label="Imię i nazwisko"
              value={
                [service.customerFirstName, service.customerLastName]
                  .filter(Boolean)
                  .join(" ") || "—"
              }
            />
            <Row label="Telefon" value={service.contactPhone} />
            <Row label="Email" value={service.contactEmail} />
          </Card>

          <Card icon={<Edit3 className="w-4 h-4" />} title="Opis usterki">
            <p
              className="text-sm whitespace-pre-wrap"
              style={{ color: "var(--text-main)" }}
            >
              {service.description ?? "—"}
            </p>
            {service.amountEstimate != null && (
              <p
                className="text-sm mt-3 pt-3 border-t flex justify-between items-center"
                style={{
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-muted)",
                }}
              >
                <span>Wycena</span>
                <span
                  className="font-bold"
                  style={{ color: "var(--text-main)" }}
                >
                  {service.amountEstimate} PLN
                </span>
              </p>
            )}
          </Card>
        </section>

        {/* PRAWA — historia, status documenso */}
        <aside className="space-y-4">
          <DocumensoStatusCard documenso={service.visualCondition?.documenso} />
          <ActionsLogCard actions={actions} />
          <MailHistoryCard messages={mailMessages} />
          <HistoryCard revisions={revisions} />
        </aside>
      </main>

    </div>
  );
}


/** Karta z aktualnym stanem podpisu Documenso + akcje (otwórz signing,
 * pobierz podpisany PDF). Pokazywana gdy potwierdzenie zostało wysłane. */
function DocumentSigningCard({
  status,
  signedPdfUrl,
  employeeSigningUrl,
}: {
  status: string;
  signedPdfUrl?: string;
  employeeSigningUrl?: string;
}) {
  const meta = DOCUMENSO_STATUS_PHRASES[status] ?? {
    label: "Status nieznany",
    color: "#64748B",
    description: "",
  };
  return (
    <div
      className="p-4 rounded-2xl border-2"
      style={{
        background: meta.color + "0d",
        borderColor: meta.color + "55",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: meta.color + "22",
            color: meta.color,
          }}
        >
          {status === "signed" ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : status === "rejected" ? (
            <AlertCircle className="w-5 h-5" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="font-semibold text-sm"
            style={{ color: meta.color }}
          >
            {meta.label}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {(status === "sent" || status === "employee_signed") &&
              employeeSigningUrl && (
                <a
                  href={employeeSigningUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  style={{
                    background:
                      status === "sent"
                        ? "linear-gradient(135deg, #06B6D4, #0891B2)"
                        : "transparent",
                    color: status === "sent" ? "#fff" : meta.color,
                    border:
                      status === "sent"
                        ? "none"
                        : `1px solid ${meta.color}55`,
                  }}
                >
                  <Pen className="w-3 h-3" />
                  {status === "sent"
                    ? "Złóż podpis pracownika"
                    : "Otwórz dokument w Documenso"}
                </a>
              )}
            {signedPdfUrl && (
              <a
                href={signedPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                style={{
                  background: "linear-gradient(135deg, #22c55e, #16a34a)",
                  color: "#fff",
                }}
              >
                <FileText className="w-3 h-3" />
                Pobierz podpisany dokument
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-4 rounded-2xl border"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <h3
        className="text-xs uppercase font-bold tracking-wider mb-3 flex items-center gap-2"
        style={{ color: "var(--text-muted)" }}
      >
        {icon}
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center text-sm gap-3">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span
        className={`text-right ${mono ? "font-mono" : ""}`}
        style={{ color: value ? "var(--text-main)" : "var(--text-muted)" }}
      >
        {value || "—"}
      </span>
    </div>
  );
}


function ActionsCard({
  eDocStatus,
  hasEmail,
  busy,
  onPrint,
  onEmail,
  onResend,
  signedPdfUrl,
}: {
  eDocStatus: string;
  hasEmail: boolean;
  busy: boolean;
  onPrint: () => void;
  onEmail: () => void;
  onResend: () => void;
  signedPdfUrl?: string;
}) {
  const eAlready =
    eDocStatus === "sent" ||
    eDocStatus === "employee_signed" ||
    eDocStatus === "signed";
  return (
    <div
      className="p-4 rounded-2xl border"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <h3
        className="text-xs uppercase font-bold tracking-wider mb-3 flex items-center gap-2"
        style={{ color: "var(--text-muted)" }}
      >
        <FileText className="w-4 h-4" />
        Potwierdzenie odbioru
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <ActionButton
          icon={<Printer className="w-4 h-4" />}
          label="Wersja papierowa"
          hint="Wydruk z miejscem na ręczne podpisy"
          onClick={onPrint}
          disabled={busy}
          color="#6366f1"
        />
        <ActionButton
          icon={<Mail className="w-4 h-4" />}
          label={eAlready ? "Wyślij ponownie" : "Podpis elektroniczny"}
          hint={
            !hasEmail
              ? "Wymagany adres email klienta"
              : eAlready
                ? "Nowy dokument do podpisu"
                : "Documenso — pracownik, następnie klient"
          }
          onClick={eAlready ? onResend : onEmail}
          disabled={!hasEmail || busy}
          color={eAlready ? "#f59e0b" : "#06B6D4"}
        />
        {signedPdfUrl && (
          <a
            href={signedPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-xl border text-left transition-all hover:scale-[1.02] sm:col-span-2"
            style={{
              background:
                "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.08))",
              borderColor: "rgba(34,197,94,0.4)",
            }}
          >
            <div
              className="flex items-center gap-2"
              style={{ color: "#22c55e" }}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-semibold">
                Pobierz dokument z podpisami
              </span>
            </div>
          </a>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  hint,
  onClick,
  disabled,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="p-3 rounded-xl border text-left transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      style={{
        background: `linear-gradient(135deg, ${color}22, ${color}11)`,
        borderColor: color + "44",
      }}
    >
      <div className="flex items-center gap-2 mb-1" style={{ color }}>
        {icon}
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {hint}
      </p>
    </button>
  );
}

function DocumensoStatusCard({
  documenso,
}: {
  documenso?: NonNullable<ServiceDetail["visualCondition"]>["documenso"];
}) {
  if (!documenso) {
    return (
      <Card icon={<Send className="w-4 h-4" />} title="Status Documenso">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Potwierdzenie elektroniczne nie zostało jeszcze wysłane.
        </p>
      </Card>
    );
  }
  const STATUS_TXT: Record<string, { label: string; color: string }> = {
    sent: { label: "Wysłano — czeka na podpis", color: "#06B6D4" },
    signed: { label: "Podpisane przez klienta", color: "#22C55E" },
    rejected: { label: "Odrzucone przez klienta", color: "#EF4444" },
    expired: { label: "Unieważnione (po edycji)", color: "#F59E0B" },
  };
  const s = STATUS_TXT[documenso.status] ?? {
    label: documenso.status,
    color: "#64748B",
  };
  return (
    <Card icon={<Send className="w-4 h-4" />} title="Status Documenso">
      <div
        className="text-sm font-semibold flex items-center gap-2"
        style={{ color: s.color }}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: s.color }}
        />
        {s.label}
      </div>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
        Wysłano {new Date(documenso.sentAt).toLocaleString("pl-PL")}
      </p>
      {documenso.completedAt && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Zakończono {new Date(documenso.completedAt).toLocaleString("pl-PL")}
        </p>
      )}
      <p
        className="text-[10px] mt-2 font-mono"
        style={{ color: "var(--text-muted)" }}
      >
        Doc #{documenso.docId}
        {documenso.previousDocIds && documenso.previousDocIds.length > 0
          ? ` (poprzednie: ${documenso.previousDocIds.join(", ")})`
          : ""}
      </p>
    </Card>
  );
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  employee_sign: { label: "Podpis pracownika", color: "#22c55e" },
  print: { label: "Wydruk PDF", color: "#6366f1" },
  send_electronic: { label: "Wysłano e-potwierdzenie", color: "#06b6d4" },
  resend_electronic: { label: "Ponowne wysłanie", color: "#f59e0b" },
  client_signed: { label: "Klient podpisał", color: "#22c55e" },
  client_rejected: { label: "Klient odrzucił", color: "#ef4444" },
  annex_issued: { label: "Aneks wystawiony", color: "#a855f7" },
  other: { label: "Inne", color: "#64748b" },
};

function ActionsLogCard({ actions }: { actions: ServiceActionEntry[] }) {
  return (
    <Card icon={<Send className="w-4 h-4" />} title="Historia akcji">
      {actions.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Brak akcji.
        </p>
      ) : (
        <ul className="space-y-2">
          {actions.slice(0, 20).map((a) => {
            const meta = ACTION_LABELS[a.action] ?? {
              label: a.action,
              color: "#64748b",
            };
            return (
              <li
                key={a.id}
                className="flex items-start gap-2 text-xs"
                style={{ color: "var(--text-main)" }}
              >
                <span
                  className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full"
                  style={{ background: meta.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold" style={{ color: meta.color }}>
                    {meta.label}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {a.summary}
                  </p>
                  <p
                    className="text-[10px] mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {new Date(a.createdAt).toLocaleString("pl-PL")}
                    {a.actorName ? ` · ${a.actorName}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const MAIL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  Sent: { label: "Wysłano", color: "#06b6d4" },
  Held: { label: "Wstrzymano", color: "#f59e0b" },
  Bounced: { label: "Zwrot", color: "#ef4444" },
  HardFail: { label: "Błąd dostarczenia", color: "#ef4444" },
  SoftFail: { label: "Tymczasowy błąd", color: "#f59e0b" },
  Pending: { label: "W kolejce", color: "#64748b" },
};

function MailHistoryCard({ messages }: { messages: MailMessage[] }) {
  return (
    <Card icon={<AtSign className="w-4 h-4" />} title="Historia wiadomości">
      {messages.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Brak wysłanych wiadomości.
        </p>
      ) : (
        <ul className="space-y-2">
          {messages.slice(0, 15).map((m) => {
            const meta = MAIL_STATUS_LABELS[m.status] ?? {
              label: m.status,
              color: "#64748b",
            };
            return (
              <li
                key={m.id}
                className="text-xs"
                style={{ color: "var(--text-main)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="font-semibold truncate"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span
                    className="text-[10px] flex-shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {new Date(m.timestamp * 1000).toLocaleString("pl-PL")}
                  </span>
                </div>
                <p className="truncate text-[11px] mt-0.5">
                  {m.subject}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function HistoryCard({ revisions }: { revisions: Revision[] }) {
  return (
    <Card icon={<History className="w-4 h-4" />} title="Historia edycji">
      {revisions.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Brak zmian od utworzenia.
        </p>
      ) : (
        <ul className="space-y-2">
          {revisions.slice(0, 12).map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-2 text-xs"
              style={{ color: "var(--text-main)" }}
            >
              <span
                className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full"
                style={{
                  background: r.isSignificant ? "#f59e0b" : "#64748b",
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="truncate">{r.summary}</p>
                <p
                  className="text-[10px] mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  {new Date(r.createdAt).toLocaleString("pl-PL")}
                  {r.editedByName ? ` · ${r.editedByName}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
