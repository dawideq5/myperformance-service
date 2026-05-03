"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Key,
  Loader2,
  MessageSquare,
  PenLine,
  Receipt,
  RefreshCw,
  Send,
  ShieldOff,
  Truck,
  Upload,
  XCircle,
} from "lucide-react";
import type { ServiceTicket } from "../tabs/ServicesBoard";
import {
  TONE_BORDER_CLASS,
  getStatusLabel,
  getStatusMeta,
} from "@/lib/services/status-meta";
import {
  formatActor,
  formatEventTimestamp,
  humanizeAction,
} from "@/lib/services/event-humanizer";

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

/**
 * Wave 22 / F7 — ikony per action_type. Zostaje w komponencie (a nie w
 * `lib/services/event-humanizer.ts`) bo `event-humanizer.ts` jest pure
 * (no react / no lucide imports), używany też w testach Vitest.
 */
const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  status_change: RefreshCw,
  quote_changed: Receipt,
  annex_created: FileText,
  annex_accepted: CheckCircle2,
  annex_rejected: XCircle,
  annex_resend: Send,
  annex_expired: XCircle,
  annex_issued: FileText,
  photo_uploaded: ImageIcon,
  photo_deleted: ImageIcon,
  employee_sign: PenLine,
  print: FileText,
  send_electronic: Send,
  resend_electronic: Send,
  client_signed: CheckCircle2,
  client_rejected: ShieldOff,
  transport_requested: Truck,
  transport_updated: Truck,
  transport_cancelled: Truck,
  release_code_generated: Key,
  release_code_sent: Key,
  release_code_resent: Key,
  release_code_failed: ShieldOff,
  release_completed: CheckCircle2,
  upload_bridge_token_issued: Upload,
  document_invalidated: ShieldOff,
  customer_message_sent: MessageSquare,
  customer_contact_recorded: MessageSquare,
  other: Activity,
};

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

        const humanized = humanizeAction(
          a.action,
          a.payload,
          a.summary,
          getStatusLabel,
        );
        const author = formatActor({
          actorName: a.actorName,
          actorEmail: a.actorEmail,
        });
        const ts = formatEventTimestamp(a.createdAt);

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
                className="text-sm font-medium"
                style={{ color: "var(--text-main)" }}
              >
                {humanized.label}
              </p>
              {humanized.description ? (
                <p
                  className="text-sm mt-0.5"
                  style={{ color: "var(--text-main)", opacity: 0.85 }}
                >
                  {humanized.description}
                </p>
              ) : null}
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                {ts}
                {ts ? " · " : ""}
                {author}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
