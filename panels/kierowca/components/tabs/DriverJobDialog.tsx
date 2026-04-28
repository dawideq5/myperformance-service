"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  MapPin,
  Phone,
  X,
} from "lucide-react";
import type { TransportJob } from "./DriverDispatch";

interface PanelLocation {
  id: string;
  name: string;
  warehouseCode: string | null;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
}

const KIND_LABELS: Record<string, string> = {
  pickup_to_service: "Odbiór do serwisu",
  return_to_customer: "Zwrot do klienta",
  warehouse_transfer: "Między magazynami",
};

export function DriverJobDialog({
  job,
  locById,
  userEmail,
  onClose,
  onUpdated,
}: {
  job: TransportJob;
  locById: Map<string, PanelLocation>;
  userEmail: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [signature, setSignature] = useState(job.recipientSignature ?? "");
  const [notes, setNotes] = useState(job.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const update = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/relay/transport-jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setSuccess("Zaktualizowano");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  };

  const takeJob = () => {
    void update({ assignedDriver: userEmail, status: "assigned" });
  };

  const startTransport = () => {
    void update({
      status: "in_transit",
      pickedUpAt: new Date().toISOString(),
    });
  };

  const finishTransport = () => {
    if (!confirm("Oznaczyć dostarczone? Spowoduje zakończenie zlecenia."))
      return;
    void update({
      status: "delivered",
      deliveredAt: new Date().toISOString(),
      recipientSignature: signature.trim() || null,
      notes: notes.trim() || null,
    });
  };

  const source = job.sourceLocationId
    ? locById.get(job.sourceLocationId) ?? null
    : null;
  const dest = job.destinationLocationId
    ? locById.get(job.destinationLocationId) ?? null
    : null;

  const mapLink = (loc: { address: string | null; lat: number | null; lng: number | null } | null, fallbackAddress: string | null) => {
    if (loc?.lat != null && loc?.lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
    }
    const addr = loc?.address ?? fallbackAddress;
    if (addr) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
    return null;
  };

  const sourceMap = mapLink(source, null);
  const destMap = mapLink(dest, job.destinationAddress);

  const isMine =
    job.assignedDriver?.toLowerCase() === userEmail.toLowerCase();

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] rounded-2xl border overflow-hidden flex flex-col"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold">
                {job.jobNumber}
              </span>
              <span
                className="text-[10px] uppercase font-mono px-2 py-0.5 rounded"
                style={{
                  background: "var(--bg-surface)",
                  color: "var(--text-muted)",
                }}
              >
                {KIND_LABELS[job.kind] ?? job.kind}
              </span>
            </div>
            {job.assignedDriver && (
              <p
                className="text-[11px] mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Kierowca: {job.assignedDriver}
                {isMine && " (ja)"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {success && (
            <div
              className="p-2 rounded-lg text-sm flex items-center gap-2"
              style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e" }}
            >
              <CheckCircle2 className="w-4 h-4" />
              {success}
            </div>
          )}
          {error && (
            <div
              className="p-2 rounded-lg text-sm"
              style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}
            >
              {error}
            </div>
          )}

          <Section title="Trasa">
            <div className="space-y-2">
              {source && (
                <RouteRow
                  label="Z"
                  loc={source}
                  mapLink={sourceMap}
                />
              )}
              {(dest || job.destinationAddress) && (
                <RouteRow
                  label="Do"
                  loc={dest}
                  fallbackAddress={job.destinationAddress}
                  mapLink={destMap}
                />
              )}
            </div>
          </Section>

          <Section title="Status">
            <div className="flex flex-wrap gap-2">
              {!isMine && job.status === "queued" && (
                <button
                  type="button"
                  onClick={takeJob}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  Weź zlecenie
                </button>
              )}
              {isMine && job.status === "assigned" && (
                <button
                  type="button"
                  onClick={startTransport}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  Rozpocznij transport
                </button>
              )}
              {isMine && job.status === "in_transit" && (
                <button
                  type="button"
                  onClick={finishTransport}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "#22c55e", color: "#fff" }}
                >
                  Oznacz jako dostarczone
                </button>
              )}
              {saving && <Loader2 className="w-4 h-4 animate-spin self-center" />}
            </div>
            <div
              className="text-[11px] mt-2 space-y-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              {job.scheduledAt && (
                <div>
                  Plan: {new Date(job.scheduledAt).toLocaleString("pl")}
                </div>
              )}
              {job.pickedUpAt && (
                <div>
                  Odebrano: {new Date(job.pickedUpAt).toLocaleString("pl")}
                </div>
              )}
              {job.deliveredAt && (
                <div>
                  Dostarczono: {new Date(job.deliveredAt).toLocaleString("pl")}
                </div>
              )}
            </div>
          </Section>

          {isMine && job.status === "in_transit" && (
            <Section title="Potwierdzenie odbioru">
              <label className="block">
                <span
                  className="block text-xs font-medium mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Imię i nazwisko odbiorcy (opcjonalnie)
                </span>
                <input
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Podpis odbioru"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                />
              </label>
              <label className="block mt-2">
                <span
                  className="block text-xs font-medium mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Notatki (opcjonalnie)
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                />
              </label>
            </Section>
          )}

          {job.notes && job.status === "delivered" && (
            <Section title="Notatki dostawy">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {job.notes}
              </p>
              {job.recipientSignature && (
                <p
                  className="text-xs mt-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Odebrał: {job.recipientSignature}
                </p>
              )}
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
  loc,
  fallbackAddress,
  mapLink,
}: {
  label: string;
  loc: PanelLocation | null;
  fallbackAddress?: string | null;
  mapLink: string | null;
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
        <div className="text-sm font-medium truncate">
          {loc?.name ?? fallbackAddress ?? "—"}
        </div>
        {loc?.address && (
          <div
            className="text-xs truncate"
            style={{ color: "var(--text-muted)" }}
          >
            {loc.address}
          </div>
        )}
        {!loc?.address && fallbackAddress && (
          <div
            className="text-xs truncate"
            style={{ color: "var(--text-muted)" }}
          >
            {fallbackAddress}
          </div>
        )}
        {loc?.phone && (
          <a
            href={`tel:${loc.phone}`}
            className="text-xs flex items-center gap-1 mt-0.5"
            style={{ color: "var(--accent)" }}
          >
            <Phone className="w-3 h-3" />
            {loc.phone}
          </a>
        )}
      </div>
      {mapLink && (
        <a
          href={mapLink}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 flex-shrink-0"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <MapPin className="w-3 h-3" />
          Trasa
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      )}
    </div>
  );
}
