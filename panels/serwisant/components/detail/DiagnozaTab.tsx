"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Loader2 } from "lucide-react";
import type { ServiceTicket } from "../tabs/ServicesBoard";
import type { ServiceStatus } from "@/lib/serwisant/status-meta";
import { PhoneViewer3D, type DamageMarker } from "../features/PhoneViewer3D";
import { PhotoGallery } from "../features/PhotoGallery";

interface DiagnozaTabProps {
  service: ServiceTicket;
  onUpdate: (updated: ServiceTicket) => void;
  onRequestStatusChange: (target: ServiceStatus) => void;
}

export function DiagnozaTab({
  service,
  onUpdate,
  onRequestStatusChange,
}: DiagnozaTabProps) {
  const [diagnosis, setDiagnosis] = useState(service.diagnosis ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Reset gdy zmieni się serviceId (przełączenie na inne zlecenie).
  useEffect(() => {
    setDiagnosis(service.diagnosis ?? "");
    setSavedAt(null);
    setError(null);
    setViewerOpen(false);
  }, [service.id, service.diagnosis]);

  const { damageMarkers, additionalNotes, ratings } = useMemo(() => {
    const vc = (service.visualCondition ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(vc.damage_markers)
      ? (vc.damage_markers as Array<Record<string, unknown>>)
      : [];
    const markers: DamageMarker[] = raw.map((m, i) => ({
      id: typeof m.id === "string" ? m.id : `marker-${i}`,
      x: typeof m.x === "number" ? m.x : 0,
      y: typeof m.y === "number" ? m.y : 0,
      z: typeof m.z === "number" ? m.z : 0,
      surface: typeof m.surface === "string" ? m.surface : undefined,
      description:
        typeof m.description === "string" ? m.description : undefined,
    }));
    const notes =
      typeof vc.additional_notes === "string" ? vc.additional_notes : undefined;
    const num = (k: string): number | null => {
      const v = vc[k];
      return typeof v === "number" ? v : null;
    };
    const str = (k: string): string | null => {
      const v = vc[k];
      return typeof v === "string" && v.trim() ? v : null;
    };
    const ratingsArr = [
      { label: "Wyświetlacz", value: num("display_rating"), notes: str("display_notes") },
      { label: "Panel tylny", value: num("back_rating"), notes: str("back_notes") },
      { label: "Aparaty", value: num("camera_rating"), notes: str("camera_notes") },
      { label: "Ramki boczne", value: num("frames_rating"), notes: str("frames_notes") },
    ].filter((r) => r.value != null || r.notes != null);
    return { damageMarkers: markers, additionalNotes: notes, ratings: ratingsArr };
  }, [service.visualCondition]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/relay/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosis: diagnosis.trim() || null }),
      });
      const json = (await res.json().catch(() => null)) as
        | { service?: ServiceTicket; error?: string }
        | null;
      if (!res.ok) {
        setError(json?.error ?? `Błąd zapisu (HTTP ${res.status})`);
        return;
      }
      if (json?.service) onUpdate(json.service);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd sieci");
    } finally {
      setSaving(false);
    }
  };

  const status = service.status as ServiceStatus;

  return (
    <div className="space-y-4">
      {/* Stan urządzenia — markery uszkodzeń + viewer 3D */}
      <Section title="Stan urządzenia">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {damageMarkers.length === 0
              ? "Sprzedawca nie zaznaczył markerów uszkodzeń."
              : `Liczba markerów uszkodzeń: ${damageMarkers.length}.`}
          </p>
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
          >
            <Box className="w-3.5 h-3.5" />
            Pokaż urządzenie
          </button>
        </div>
      </Section>

      {viewerOpen && (
        <PhoneViewer3D
          brand={service.brand ?? ""}
          damageMarkers={damageMarkers}
          additionalNotes={additionalNotes}
          onClose={() => setViewerOpen(false)}
        />
      )}

      {/* Stan techniczny — oceny sprzedawcy i kod blokady */}
      <Section title="Stan techniczny urządzenia">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div
            className="p-2 rounded-lg"
            style={{ background: "var(--bg-surface)" }}
          >
            <p
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Kod blokady
            </p>
            <p
              className="text-sm font-mono mt-0.5"
              style={{
                color: service.lockCode
                  ? "var(--text-main)"
                  : "var(--text-muted)",
              }}
            >
              {service.lockCode ?? "Brak — urządzenie odblokowane lub kod nie został przekazany"}
            </p>
          </div>
          {service.imei && (
            <div
              className="p-2 rounded-lg"
              style={{ background: "var(--bg-surface)" }}
            >
              <p
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                IMEI
              </p>
              <p
                className="text-sm font-mono mt-0.5"
                style={{ color: "var(--text-main)" }}
              >
                {service.imei}
              </p>
            </div>
          )}
        </div>

        {ratings.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Oceny sprzedawcy (1–10)
            </p>
            {ratings.map((r) => (
              <div
                key={r.label}
                className="flex items-start gap-2 p-2 rounded-lg"
                style={{ background: "var(--bg-surface)" }}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs font-medium"
                    style={{ color: "var(--text-main)" }}
                  >
                    {r.label}
                  </p>
                  {r.notes && (
                    <p
                      className="text-[11px] mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {r.notes}
                    </p>
                  )}
                </div>
                {r.value != null && (
                  <span
                    className="text-xs font-mono px-2 py-0.5 rounded flex-shrink-0"
                    style={{
                      background:
                        r.value >= 8
                          ? "rgba(34,197,94,0.15)"
                          : r.value >= 5
                            ? "rgba(245,158,11,0.15)"
                            : "rgba(239,68,68,0.15)",
                      color:
                        r.value >= 8
                          ? "#22c55e"
                          : r.value >= 5
                            ? "#f59e0b"
                            : "#ef4444",
                    }}
                  >
                    {r.value}/10
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {additionalNotes && (
          <div className="mt-3">
            <p
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Uwagi dodatkowe sprzedawcy
            </p>
            <p
              className="text-xs mt-1 whitespace-pre-wrap p-2 rounded-lg"
              style={{
                background: "var(--bg-surface)",
                color: "var(--text-main)",
              }}
            >
              {additionalNotes}
            </p>
          </div>
        )}
      </Section>

      {/* Notatki diagnostyczne — edytowalne */}
      <Section title="Diagnoza">
        <textarea
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          rows={5}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-y"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
          placeholder="Co znaleziono, jakie czynności wykonano, jakie testy uruchomiono…"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Zapisz diagnozę
          </button>
          {savedAt && !saving && (
            <span
              className="text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              Zapisano
            </span>
          )}
          {error && (
            <span className="text-[11px]" style={{ color: "#ef4444" }}>
              {error}
            </span>
          )}
        </div>
      </Section>

      <Section title="Zdjęcia diagnostyczne">
        <PhotoGallery serviceId={service.id} stage="diagnosis" />
      </Section>

      {/* Sugerowane akcje statusowe */}
      <Section title="Następny krok">
        <div className="flex flex-wrap gap-2">
          {status === "received" && (
            <button
              type="button"
              onClick={() => onRequestStatusChange("diagnosing")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Rozpocznij diagnozę
            </button>
          )}
          {status === "diagnosing" && (
            <button
              type="button"
              onClick={() => onRequestStatusChange("awaiting_quote")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Zaproponuj wycenę
            </button>
          )}
          {status !== "received" && status !== "diagnosing" && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Brak sugerowanych akcji dla aktualnego statusu — użyj przycisku
              „Zmień status” w nagłówku.
            </p>
          )}
        </div>
      </Section>
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
