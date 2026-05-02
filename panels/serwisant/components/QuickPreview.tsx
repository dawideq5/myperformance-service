"use client";

import { ExternalLink, Mail, Phone, Smartphone, User } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { ServiceTicket } from "./tabs/ServicesBoard";

interface QuickPreviewProps {
  service: ServiceTicket;
  onOpenFull: () => void;
  /** Ostatnie zdarzenia (max 3) — opcjonalne. */
  recentEvents?: { at: string; label: string }[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function QuickPreview({
  service,
  onOpenFull,
  recentEvents,
}: QuickPreviewProps) {
  const customerName = [service.customerFirstName, service.customerLastName]
    .filter(Boolean)
    .join(" ");
  const device = [service.brand, service.model, service.color]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="flex flex-col h-full p-5 gap-5"
      style={{ color: "var(--text-main)" }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="font-mono text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            #{service.ticketNumber}
          </p>
          <h2 className="text-lg font-semibold truncate mt-0.5">
            {device || "Urządzenie nieokreślone"}
          </h2>
        </div>
        <StatusBadge status={service.status} size="md" />
      </header>

      {/* Klient */}
      <section className="space-y-1.5">
        <h3
          className="text-[11px] uppercase font-semibold tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Klient
        </h3>
        <div className="flex items-center gap-2 text-sm">
          <User
            className="w-4 h-4 flex-shrink-0"
            style={{ color: "var(--text-muted)" }}
          />
          <span>{customerName || "Brak danych"}</span>
        </div>
        {service.contactPhone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone
              className="w-4 h-4 flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
            <a
              href={`tel:${service.contactPhone}`}
              className="hover:underline"
            >
              {service.contactPhone}
            </a>
          </div>
        )}
        {service.contactEmail && (
          <div className="flex items-center gap-2 text-sm">
            <Mail
              className="w-4 h-4 flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
            <a
              href={`mailto:${service.contactEmail}`}
              className="hover:underline truncate"
            >
              {service.contactEmail}
            </a>
          </div>
        )}
      </section>

      {/* Urządzenie */}
      <section className="space-y-1.5">
        <h3
          className="text-[11px] uppercase font-semibold tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Urządzenie
        </h3>
        <div className="flex items-center gap-2 text-sm">
          <Smartphone
            className="w-4 h-4 flex-shrink-0"
            style={{ color: "var(--text-muted)" }}
          />
          <span className="truncate">{device || "—"}</span>
        </div>
        {service.imei && (
          <div
            className="text-xs font-mono"
            style={{ color: "var(--text-muted)" }}
          >
            IMEI: {service.imei}
          </div>
        )}
      </section>

      {/* Wycena */}
      {(service.amountEstimate != null || service.amountFinal != null) && (
        <section className="space-y-1.5">
          <h3
            className="text-[11px] uppercase font-semibold tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Wycena
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {service.amountEstimate != null && (
              <div>
                <p
                  className="text-[10px] uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Wstępna
                </p>
                <p className="font-medium">{service.amountEstimate} PLN</p>
              </div>
            )}
            {service.amountFinal != null && (
              <div>
                <p
                  className="text-[10px] uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Ostateczna
                </p>
                <p className="font-medium">{service.amountFinal} PLN</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Ostatnie zdarzenia */}
      {recentEvents && recentEvents.length > 0 && (
        <section className="space-y-1.5">
          <h3
            className="text-[11px] uppercase font-semibold tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Ostatnie działania
          </h3>
          <ul className="space-y-1 text-xs">
            {recentEvents.slice(0, 3).map((evt, idx) => (
              <li key={idx} className="flex gap-2">
                <span
                  className="font-mono flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  {formatDate(evt.at)}
                </span>
                <span style={{ color: "var(--text-main)" }}>{evt.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div
        className="text-[11px] mt-auto pt-3 border-t"
        style={{
          color: "var(--text-muted)",
          borderColor: "var(--border-subtle)",
        }}
      >
        Utworzone: {formatDate(service.createdAt)}
        {service.assignedTechnician && (
          <>
            {" · "}Technik: {service.assignedTechnician}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenFull}
        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        <ExternalLink className="w-4 h-4" />
        Otwórz pełny widok
      </button>
    </div>
  );
}
