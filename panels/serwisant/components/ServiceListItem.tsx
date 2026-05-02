"use client";

import type { KeyboardEvent } from "react";
import {
  TONE_BORDER_CLASS,
  getStatusMeta,
} from "@/lib/serwisant/status-meta";
import { StatusBadge } from "./StatusBadge";
import type { ServiceTicket } from "./tabs/ServicesBoard";

interface ServiceListItemProps {
  service: ServiceTicket;
  selected: boolean;
  onClick: () => void;
  /** Opcjonalny opis ostatniej akcji (linia 4). */
  lastActivity?: { at: string; label: string } | null;
}

/** Format relatywny (PL) — bez zewnętrznej biblioteki. */
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
  });
}

/**
 * SLA — minimalny heurystyk: jeśli `promisedAt` minęło, oznacz jako
 * przekroczone. Backend agent może rozszerzyć Service o realne pole
 * `slaBreached` w przyszłości — wtedy preferujemy je.
 */
function isSlaBreached(service: ServiceTicket): boolean {
  const dynamic = service as ServiceTicket & {
    slaBreached?: boolean;
    dueDate?: string | null;
  };
  if (typeof dynamic.slaBreached === "boolean") return dynamic.slaBreached;
  const due = dynamic.dueDate ?? service.promisedAt;
  if (!due) return false;
  const t = new Date(due).getTime();
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}

export function ServiceListItem({
  service,
  selected,
  onClick,
  lastActivity = null,
}: ServiceListItemProps) {
  const meta = getStatusMeta(service.status);
  const breached = isSlaBreached(service);
  const customerName = [service.customerFirstName, service.customerLastName]
    .filter(Boolean)
    .join(" ");
  const device = [service.brand, service.model, service.color]
    .filter(Boolean)
    .join(" ");

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  const baseClasses = [
    "group relative w-full text-left rounded-lg border-l-4 transition-colors cursor-pointer",
    "px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
    TONE_BORDER_CLASS[meta.tone],
    selected
      ? "bg-[color:rgb(99_102_241/0.08)] border-y border-r border-[var(--accent)]"
      : "border-y border-r border-transparent hover:bg-white/[0.03]",
  ].join(" ");

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onClick}
      onKeyDown={handleKey}
      className={baseClasses}
      style={{
        background: selected
          ? "color-mix(in srgb, var(--accent) 6%, var(--bg-card))"
          : "var(--bg-card)",
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span
          className="font-mono text-xs font-semibold truncate"
          style={{ color: "var(--text-main)" }}
        >
          #{service.ticketNumber}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {breached && (
            <span
              className="w-2 h-2 rounded-full bg-rose-500"
              title="SLA przekroczone"
              aria-label="SLA przekroczone"
            />
          )}
          <StatusBadge status={service.status} size="sm" />
        </div>
      </div>

      <div
        className="text-sm font-medium truncate"
        style={{ color: "var(--text-main)" }}
      >
        {device || "Urządzenie nieokreślone"}
      </div>

      {(customerName || service.contactPhone) && (
        <div
          className="text-xs truncate mt-0.5"
          style={{ color: "var(--text-muted)" }}
        >
          {customerName || "Klient nieokreślony"}
          {service.contactPhone ? ` · ${service.contactPhone}` : ""}
        </div>
      )}

      {lastActivity && (
        <div
          className="text-[11px] mt-1 truncate"
          style={{ color: "var(--text-muted)" }}
        >
          <span className="font-medium">{formatRelative(lastActivity.at)}</span>
          {": "}
          <span>{lastActivity.label}</span>
        </div>
      )}
    </div>
  );
}
