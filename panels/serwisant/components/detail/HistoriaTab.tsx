"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  PenLine,
  Receipt,
  RefreshCw,
  Send,
  ShieldOff,
  XCircle,
} from "lucide-react";
import type { ServiceTicket } from "../tabs/ServicesBoard";
import {
  TONE_BORDER_CLASS,
  getStatusMeta,
} from "@/lib/serwisant/status-meta";

interface ServiceAction {
  id: string;
  action: string;
  summary: string;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
  payload?: Record<string, unknown> | null;
}

interface HistoriaTabProps {
  service: ServiceTicket;
}

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  status_change: RefreshCw,
  quote_changed: Receipt,
  annex_created: FileText,
  annex_accepted: CheckCircle2,
  annex_rejected: XCircle,
  annex_issued: FileText,
  photo_uploaded: ImageIcon,
  photo_deleted: ImageIcon,
  employee_sign: PenLine,
  print: FileText,
  send_electronic: Send,
  resend_electronic: Send,
  client_signed: CheckCircle2,
  client_rejected: ShieldOff,
  other: Activity,
};

/**
 * Humanizuje summary akcji do języka naturalnego — zamiast "received → diagnosing"
 * wyświetla "Przyjęte → W diagnostyce", zamiast "Δ +150 PLN" → "z 280 PLN do 380 PLN".
 */
function humanizeSummary(
  action: string,
  summary: string,
  payload: Record<string, unknown> | null | undefined,
): string {
  if (action === "status_change" && payload) {
    const from = typeof payload.from === "string" ? payload.from : null;
    const to = typeof payload.to === "string" ? payload.to : null;
    if (from && to) {
      const fromLabel = getStatusMeta(from).label;
      const toLabel = getStatusMeta(to).label;
      return `Status: ${fromLabel} → ${toLabel}`;
    }
  }
  if (action === "quote_changed" && payload) {
    const oldA = typeof payload.oldAmount === "number" ? payload.oldAmount : null;
    const newA = typeof payload.newAmount === "number" ? payload.newAmount : null;
    if (oldA != null && newA != null) {
      return `Zmiana wyceny z ${oldA.toFixed(2)} PLN na ${newA.toFixed(2)} PLN`;
    }
  }
  if ((action === "annex_created" || action === "annex_accepted") && payload) {
    const oldA = typeof payload.previousAmount === "number" ? payload.previousAmount : null;
    const newA = typeof payload.newAmount === "number" ? payload.newAmount : null;
    const verb = action === "annex_created" ? "Utworzono aneks" : "Klient zaakceptował aneks";
    if (oldA != null && newA != null) {
      return `${verb} — wycena z ${oldA.toFixed(2)} na ${newA.toFixed(2)} PLN`;
    }
    return verb;
  }
  if (action === "annex_rejected") return "Klient odrzucił aneks";
  if (action === "transport_requested" && payload) {
    const dest =
      typeof payload.destinationName === "string"
        ? payload.destinationName
        : typeof payload.targetLocationId === "string"
          ? payload.targetLocationId
          : "innego serwisu";
    const reason = typeof payload.reason === "string" ? payload.reason : "";
    return reason
      ? `Wysłano zlecenie transportu do ${dest} — ${reason}`
      : `Wysłano zlecenie transportu do ${dest}`;
  }
  if (action === "transport_cancelled") return "Anulowano zlecenie transportu";
  if (action === "transport_updated") return "Zmieniono dane zlecenia transportu";
  if (action === "photo_uploaded" && payload) {
    const stage = typeof payload.stage === "string" ? payload.stage : null;
    const stageLabel: Record<string, string> = {
      intake: "przyjęcia",
      diagnosis: "diagnozy",
      in_repair: "naprawy",
      before_delivery: "przed wydaniem",
      other: "inne",
    };
    return stage
      ? `Dodano zdjęcie (etap ${stageLabel[stage] ?? stage})`
      : "Dodano zdjęcie do zlecenia";
  }
  if (action === "photo_deleted") return "Usunięto zdjęcie";
  if (action === "note_added" && payload) {
    const vis = typeof payload.visibility === "string" ? payload.visibility : null;
    if (vis === "service_only") return "Dodano notatkę (tylko serwis)";
    if (vis === "sales_only") return "Dodano notatkę (tylko sprzedaż)";
    return "Dodano notatkę zespołową";
  }
  if (action === "note_deleted") return "Usunięto notatkę";
  if (action === "component_added" && payload) {
    const name = typeof payload.name === "string" ? payload.name : "";
    return name ? `Dodano komponent: ${name}` : "Dodano komponent do wyceny";
  }
  if (action === "component_updated") return "Zaktualizowano komponent";
  if (action === "component_deleted") return "Usunięto komponent";
  if (action === "part_ordered") return "Zamówiono część";
  if (action === "part_received") return "Otrzymano część";
  if (action === "customer_data_updated") return "Zaktualizowano dane klienta";
  if (action === "device_condition_updated") return "Zaktualizowano stan techniczny urządzenia";
  if (action === "damage_marker_added") return "Dodano marker uszkodzenia";
  if (action === "damage_marker_removed") return "Usunięto marker uszkodzenia";
  if (action === "damage_marker_updated") return "Edytowano marker uszkodzenia";
  if (action === "customer_message_sent" && payload) {
    const channel = typeof payload.channel === "string" ? payload.channel : "";
    const ch: Record<string, string> = { email: "e-mail", sms: "SMS", chatwoot: "czat" };
    return `Wysłano wiadomość do klienta (${ch[channel] ?? channel})`;
  }
  if (action === "upload_bridge_token_issued") return "Wysłano kod QR do uploadu zdjęć";
  // Fallback do oryginalnego summary jeśli mamy, inaczej raw action
  return summary || action;
}

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "przed chwilą";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min temu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} godz. temu`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} d. temu`;
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function HistoriaTab({ service }: HistoriaTabProps) {
  const [actions, setActions] = useState<ServiceAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/relay/services/${service.id}/actions`)
      .then((r) => r.json())
      .then((j: { actions?: ServiceAction[] }) => {
        if (!cancelled) setActions(j?.actions ?? []);
      })
      .catch(() => {
        if (!cancelled) setActions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [service.id]);

  const sorted = [...actions].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2
          className="w-5 h-5 animate-spin"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div
        className="p-3 rounded-xl border text-center text-sm"
        style={{
          borderColor: "var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        Brak zdarzeń w historii zlecenia.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((a) => {
        const Icon = ACTION_ICONS[a.action] ?? Activity;
        const isStatusChange = a.action === "status_change";
        const toStatus =
          isStatusChange &&
          a.payload &&
          typeof a.payload.to === "string"
            ? (a.payload.to as string)
            : null;
        const meta = toStatus ? getStatusMeta(toStatus) : null;
        const borderClass = meta
          ? TONE_BORDER_CLASS[meta.tone]
          : "border-l-slate-600";

        return (
          <div
            key={a.id}
            className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${borderClass}`}
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: "var(--bg-surface)",
                color: "var(--text-muted)",
              }}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-sm"
                style={{ color: "var(--text-main)" }}
              >
                {humanizeSummary(a.action, a.summary, a.payload)}
              </p>
              <p
                className="text-[11px] mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                {a.actorName ?? a.actorEmail ?? "System"} ·{" "}
                {formatRelative(a.createdAt)}
              </p>
            </div>
            <span
              className="text-[10px] font-mono whitespace-nowrap"
              style={{ color: "var(--text-muted)" }}
            >
              {new Date(a.createdAt).toLocaleString("pl-PL", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
