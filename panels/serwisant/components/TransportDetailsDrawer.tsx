"use client";

import { useEffect } from "react";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Truck,
  User,
  X,
  XCircle,
} from "lucide-react";

/**
 * Wave 22 / F10 — Transport details drawer (read-only).
 *
 * Pokazuje pełne szczegóły zlecenia transportu z perspektywy serwisanta.
 * Read-only: serwisant NIE edytuje statusów ani podpisu — to robi kierowca
 * w swoim panelu. Tutaj jedynie podgląd:
 *  - status badge (color-coded),
 *  - kierunek (źródło → cel),
 *  - timeline (created, scheduled, picked-up, delivered, cancelled),
 *  - kierowca (assignedDriver email),
 *  - dystans (Haversine między source/dest gdy mamy lat/lng),
 *  - powód transportu, notatki kierowcy,
 *  - podpis odbiorcy (text albo base64 PNG),
 *  - tracking link (jeśli istnieje).
 *
 * SSE: refresh listy/drawer po `transport_job_updated` jest realizowany
 * przez parent (NaprawaTab) — drawer jedynie wyświetla props.
 */

export interface TransportJobDetail {
  id: string;
  jobNumber: string;
  status: string;
  kind: string;
  serviceId: string | null;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
  destinationAddress: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
  assignedDriver: string | null;
  scheduledAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  recipientSignature: string | null;
  notes: string | null;
  reason: string | null;
  trackingLink: string | null;
  createdByEmail: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TransportLocationLookup {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

interface TransportDetailsDrawerProps {
  job: TransportJobDetail;
  locationsById: Record<string, TransportLocationLookup>;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  queued: { label: "W kolejce", color: "#F59E0B" },
  assigned: { label: "Przypisany kierowca", color: "#0EA5E9" },
  in_transit: { label: "W transporcie", color: "#A855F7" },
  delivered: { label: "Dostarczone", color: "#22C55E" },
  cancelled: { label: "Anulowane", color: "#64748B" },
};

const KIND_LABELS: Record<string, string> = {
  pickup_to_service: "Odbiór do serwisu",
  return_to_customer: "Zwrot do klienta",
  warehouse_transfer: "Między magazynami",
};

/** Haversine — odległość km między dwoma punktami GPS. */
function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isBase64Png(value: string | null): boolean {
  if (!value) return false;
  return value.startsWith("data:image/png;base64,") ||
    value.startsWith("data:image/jpeg;base64,") ||
    value.startsWith("data:image/jpg;base64,");
}

export function TransportDetailsDrawer({
  job,
  locationsById,
  onClose,
}: TransportDetailsDrawerProps) {
  // ESC zamyka drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const statusMeta = STATUS_LABELS[job.status] ?? {
    label: job.status,
    color: "#64748B",
  };
  const kindLabel = KIND_LABELS[job.kind] ?? job.kind;

  const sourceLocation = job.sourceLocationId
    ? locationsById[job.sourceLocationId] ?? null
    : null;
  const destLocation = job.destinationLocationId
    ? locationsById[job.destinationLocationId] ?? null
    : null;
  const destLat = destLocation?.lat ?? job.destinationLat;
  const destLng = destLocation?.lng ?? job.destinationLng;

  const distance =
    sourceLocation?.lat != null &&
    sourceLocation?.lng != null &&
    destLat != null &&
    destLng != null
      ? distanceKm(
          { lat: sourceLocation.lat, lng: sourceLocation.lng },
          { lat: destLat, lng: destLng },
        )
      : null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Szczegóły transportu ${job.jobNumber}`}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] rounded-2xl border overflow-hidden flex flex-col"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Truck
                className="w-4 h-4 flex-shrink-0"
                style={{ color: statusMeta.color }}
                aria-hidden="true"
              />
              <span
                className="font-mono text-sm font-semibold"
                style={{ color: "var(--text-main)" }}
              >
                {job.jobNumber}
              </span>
              <span
                className="text-[10px] uppercase font-bold px-2 py-0.5 rounded"
                style={{
                  background: statusMeta.color + "22",
                  color: statusMeta.color,
                }}
              >
                {statusMeta.label}
              </span>
            </div>
            <p
              className="text-[11px] mt-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              {kindLabel}
              {distance != null && (
                <>
                  {" · "}
                  {distance < 1
                    ? `${Math.round(distance * 1000)} m`
                    : `${distance.toFixed(1)} km`}
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg flex-shrink-0"
            style={{ color: "var(--text-muted)" }}
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {/* Trasa */}
          <Section title="Trasa">
            <div className="space-y-2">
              <RouteRow
                label="Z"
                name={sourceLocation?.name ?? "—"}
                address={sourceLocation?.address ?? null}
              />
              <RouteRow
                label="Do"
                name={destLocation?.name ?? job.destinationAddress ?? "—"}
                address={
                  destLocation?.address ??
                  (destLocation ? null : job.destinationAddress)
                }
              />
            </div>
          </Section>

          {/* Kierowca */}
          <Section title="Kierowca">
            <div className="flex items-center gap-2">
              <User
                className="w-4 h-4"
                style={{ color: "var(--text-muted)" }}
                aria-hidden="true"
              />
              <span className="text-sm" style={{ color: "var(--text-main)" }}>
                {job.assignedDriver ?? "Nie przypisano"}
              </span>
            </div>
          </Section>

          {/* Timeline */}
          <Section title="Przebieg">
            <ol className="space-y-2">
              <TimelineItem
                label="Utworzono"
                iso={job.createdAt}
                done
                icon={<Clock className="w-3.5 h-3.5" aria-hidden="true" />}
              />
              {job.scheduledAt && (
                <TimelineItem
                  label="Zaplanowano"
                  iso={job.scheduledAt}
                  done
                  icon={<Clock className="w-3.5 h-3.5" aria-hidden="true" />}
                />
              )}
              <TimelineItem
                label="Odebrano"
                iso={job.pickedUpAt}
                done={job.pickedUpAt != null}
                icon={<Truck className="w-3.5 h-3.5" aria-hidden="true" />}
              />
              <TimelineItem
                label="Dostarczono"
                iso={job.deliveredAt}
                done={job.deliveredAt != null}
                icon={
                  <CheckCircle2
                    className="w-3.5 h-3.5"
                    style={{ color: job.deliveredAt ? "#22c55e" : undefined }}
                    aria-hidden="true"
                  />
                }
              />
              {job.cancelledAt && (
                <TimelineItem
                  label="Anulowano"
                  iso={job.cancelledAt}
                  done
                  icon={
                    <XCircle
                      className="w-3.5 h-3.5"
                      style={{ color: "#ef4444" }}
                      aria-hidden="true"
                    />
                  }
                />
              )}
            </ol>
          </Section>

          {/* Powód i notatki */}
          {(job.reason || job.notes) && (
            <Section title="Notatki">
              {job.reason && (
                <div className="mb-2">
                  <p
                    className="text-[10px] uppercase tracking-wider mb-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Powód transportu
                  </p>
                  <p className="text-sm" style={{ color: "var(--text-main)" }}>
                    {job.reason}
                  </p>
                </div>
              )}
              {job.notes && (
                <div>
                  <p
                    className="text-[10px] uppercase tracking-wider mb-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Notatka kierowcy
                  </p>
                  <p
                    className="text-sm whitespace-pre-wrap"
                    style={{ color: "var(--text-main)" }}
                  >
                    {job.notes}
                  </p>
                </div>
              )}
            </Section>
          )}

          {/* Podpis odbiorcy */}
          {job.recipientSignature && (
            <Section title="Podpis odbiorcy">
              {isBase64Png(job.recipientSignature) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={job.recipientSignature}
                  alt="Podpis odbiorcy"
                  className="rounded-lg border max-h-40"
                  style={{
                    background: "#fff",
                    borderColor: "var(--border-subtle)",
                  }}
                />
              ) : (
                <p className="text-sm" style={{ color: "var(--text-main)" }}>
                  {job.recipientSignature}
                </p>
              )}
            </Section>
          )}

          {/* Tracking link */}
          {job.trackingLink && (
            <Section title="Śledzenie">
              <a
                href={job.trackingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs inline-flex items-center gap-1.5"
                style={{ color: "var(--accent)" }}
              >
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                Otwórz tracking
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </Section>
          )}
        </div>
      </div>
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

function RouteRow({
  label,
  name,
  address,
}: {
  label: string;
  name: string;
  address: string | null;
}) {
  return (
    <div
      className="flex items-start gap-2 p-2 rounded-lg"
      style={{ background: "var(--bg-surface)" }}
    >
      <span
        className="text-[10px] uppercase font-mono mt-0.5"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium truncate"
          style={{ color: "var(--text-main)" }}
        >
          {name}
        </div>
        {address && (
          <div
            className="text-xs truncate"
            style={{ color: "var(--text-muted)" }}
          >
            {address}
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineItem({
  label,
  iso,
  done,
  icon,
}: {
  label: string;
  iso: string | null;
  done: boolean;
  icon: React.ReactNode;
}) {
  return (
    <li
      className="flex items-center gap-2 text-xs"
      style={{
        color: done ? "var(--text-main)" : "var(--text-muted)",
        opacity: done ? 1 : 0.55,
      }}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="font-medium min-w-[110px]">{label}</span>
      <span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
        {formatDateTime(iso)}
      </span>
    </li>
  );
}
