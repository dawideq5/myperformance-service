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
                {a.summary || a.action}
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
