"use client";

import { useEffect, useState } from "react";
import { Loader2, Truck, Wrench } from "lucide-react";
import type { ServiceTicket } from "../tabs/ServicesBoard";
import type { ServiceStatus } from "@/lib/serwisant/status-meta";
import { StatusBadge } from "../StatusBadge";
import { PhotoGallery } from "../features/PhotoGallery";
import {
  TransportModal,
  type TransportLocationOption,
} from "../TransportModal";

interface ServiceAction {
  id: string;
  action: string;
  summary: string;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
  payload?: Record<string, unknown> | null;
}

interface NaprawaTabProps {
  service: ServiceTicket;
  onRequestStatusChange: (target: ServiceStatus) => void;
  /** Wywoływane gdy backend zwróci zaktualizowany serwis (np. po wysłaniu
   *  zlecenia transportu). Pozwala parentowi (ServiceDetailView) odświeżyć
   *  cache bez ponownego fetcha. */
  onServiceUpdated?: (updated: ServiceTicket) => void;
}

interface TransportJobSummary {
  id: string;
  status: string;
  destinationLocationId: string | null;
  destinationName: string | null;
  jobNumber: string;
  createdAt: string | null;
}

const TRANSPORT_STATUS_LABELS: Record<string, string> = {
  queued: "W kolejce",
  assigned: "Przypisany kierowca",
  in_transit: "W transporcie",
  delivered: "Dostarczone",
  cancelled: "Anulowano",
};

export function NaprawaTab({
  service,
  onRequestStatusChange,
  onServiceUpdated,
}: NaprawaTabProps) {
  const [actions, setActions] = useState<ServiceAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [serviceLocations, setServiceLocations] = useState<
    TransportLocationOption[]
  >([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [transportModalOpen, setTransportModalOpen] = useState(false);
  const [activeTransport, setActiveTransport] = useState<TransportJobSummary | null>(
    null,
  );

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

  // Lista wszystkich punktów serwisowych do TransportModal — pobieramy raz
  // przy mount, lokalnie filtrujemy bieżącą lokalizację w samym modalu.
  useEffect(() => {
    let cancelled = false;
    setLocationsLoading(true);
    fetch(`/api/relay/service-locations`)
      .then((r) => r.json())
      .then(
        (j: {
          services?: Array<{ id: string; name: string }>;
        }) => {
          if (cancelled) return;
          setServiceLocations(j?.services ?? []);
        },
      )
      .catch(() => {
        if (!cancelled) setServiceLocations([]);
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Aktywny transport dla tego zlecenia — pokazujemy chip + blokujemy
  // ponowne wystawienie z UI (backend i tak waliduje).
  useEffect(() => {
    let cancelled = false;
    interface TransportJobRow {
      id: string;
      status: string;
      destinationLocationId: string | null;
      jobNumber: string;
      createdAt: string | null;
    }
    fetch(
      `/api/relay/transport-jobs?serviceId=${encodeURIComponent(service.id)}&status=queued,assigned,in_transit&limit=5`,
    )
      .then((r) => r.json())
      .then((j: { jobs?: TransportJobRow[] }) => {
        if (cancelled) return;
        const job =
          j?.jobs?.find((row) =>
            ["queued", "assigned", "in_transit"].includes(row.status),
          ) ?? null;
        if (!job) {
          setActiveTransport(null);
          return;
        }
        const dest = serviceLocations.find(
          (l) => l.id === job.destinationLocationId,
        );
        setActiveTransport({
          id: job.id,
          status: job.status,
          destinationLocationId: job.destinationLocationId,
          destinationName: dest?.name ?? null,
          jobNumber: job.jobNumber,
          createdAt: job.createdAt,
        });
      })
      .catch(() => {
        if (!cancelled) setActiveTransport(null);
      });
    return () => {
      cancelled = true;
    };
  }, [service.id, serviceLocations]);

  const repairActions = actions.filter((a) => a.action.startsWith("repair_"));

  const submitNote = async () => {
    if (!note.trim()) return;
    setSubmittingNote(true);
    setNoteError(null);
    // TODO: dedykowany endpoint /api/panel/services/[id]/note nie istnieje.
    // Tymczasowo zostawiamy NIE-zapisany input w UI; po implementacji
    // endpointu (Phase 3 backend) podpinamy POST tutaj.
    setNoteError("Endpoint dla notatek serwisowych nie jest jeszcze dostępny.");
    setSubmittingNote(false);
  };

  const status = service.status as ServiceStatus;

  return (
    <div className="space-y-4">
      <Section title="Status naprawy">
        <div className="flex items-center gap-2 mb-3">
          <StatusBadge status={status} size="md" />
          {service.holdReason && status === "on_hold" && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Powód: {service.holdReason}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {status !== "on_hold" && (
            <button
              type="button"
              onClick={() => onRequestStatusChange("on_hold")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              Wstrzymaj
            </button>
          )}
          {status === "on_hold" && service.previousStatus && (
            <button
              type="button"
              onClick={() =>
                onRequestStatusChange(
                  (service.previousStatus ?? "diagnosing") as ServiceStatus,
                )
              }
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Wznów
            </button>
          )}
          {(status === "repairing" || status === "awaiting_parts") && (
            <button
              type="button"
              onClick={() => onRequestStatusChange("testing")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Wyślij na testy
            </button>
          )}
          {status === "awaiting_parts" && (
            <button
              type="button"
              onClick={() => onRequestStatusChange("repairing")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              Wznów naprawę
            </button>
          )}
        </div>
      </Section>

      <Section title="Transport między serwisami">
        {activeTransport ? (
          <div
            className="flex flex-wrap items-center gap-2 p-2 rounded-lg border"
            style={{
              background: "rgba(14, 165, 233, 0.08)",
              borderColor: "rgba(14, 165, 233, 0.4)",
              color: "var(--text-main)",
            }}
          >
            <Truck
              className="w-4 h-4"
              style={{ color: "rgba(14, 165, 233, 0.9)" }}
            />
            <span className="text-xs font-semibold">
              {TRANSPORT_STATUS_LABELS[activeTransport.status] ??
                activeTransport.status}
              {activeTransport.destinationName
                ? ` do ${activeTransport.destinationName}`
                : ""}
            </span>
            <span
              className="text-[11px] font-mono"
              style={{ color: "var(--text-muted)" }}
            >
              #{activeTransport.jobNumber}
            </span>
            <a
              href={`/api/relay/transport-jobs/${activeTransport.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-[11px] underline"
              style={{ color: "var(--text-muted)" }}
            >
              Śledź zlecenie
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Przekieruj naprawę do innego punktu serwisowego — system utworzy
              zlecenie dla kierowcy i wstrzyma bieżącą naprawę do czasu
              odbioru.
            </p>
            <button
              type="button"
              onClick={() => setTransportModalOpen(true)}
              disabled={locationsLoading || serviceLocations.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              <Truck className="w-3.5 h-3.5" />
              Wyślij do innego serwisu
            </button>
            {locationsLoading && (
              <p
                className="text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                Pobieranie listy serwisów…
              </p>
            )}
          </div>
        )}
      </Section>

      <Section title="Czynności naprawcze">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2
              className="w-4 h-4 animate-spin"
              style={{ color: "var(--text-muted)" }}
            />
          </div>
        ) : repairActions.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Brak zarejestrowanych czynności naprawczych.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {repairActions.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-2 p-2 rounded-lg"
                style={{ background: "var(--bg-surface)" }}
              >
                <Wrench
                  className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs" style={{ color: "var(--text-main)" }}>
                    {a.summary || a.action}
                  </p>
                  <p
                    className="text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {a.actorName ?? a.actorEmail ?? "—"} ·{" "}
                    {new Date(a.createdAt).toLocaleString("pl-PL")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Zdjęcia z naprawy">
        <PhotoGallery serviceId={service.id} stage="in_repair" />
      </Section>

      <Section title="Notatka serwisowa">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-y"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
          placeholder="Notatka techniczna do logu zlecenia…"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void submitNote()}
            disabled={submittingNote || !note.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {submittingNote && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Dodaj wpis
          </button>
          {noteError && (
            <span className="text-[11px]" style={{ color: "#ef4444" }}>
              {noteError}
            </span>
          )}
        </div>
      </Section>

      {transportModalOpen && (
        <TransportModal
          service={service}
          availableLocations={serviceLocations}
          onClose={() => setTransportModalOpen(false)}
          onSuccess={(updated) => {
            onServiceUpdated?.(updated);
          }}
        />
      )}
    </div>
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
