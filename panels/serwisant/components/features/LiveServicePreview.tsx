"use client";

/**
 * LiveServicePreview (Wave 22 / F15).
 *
 * Read-only widok zlecenia z real-time updates. Używane przez serwisanta
 * gdy sprzedawca aktywnie edytuje formularz przyjęcia (`service.field_changed`
 * SSE events). Subskrybuje channel `service:<id>` przez sse-client; każda
 * zmiana pola powoduje highlight (1s) i merge do lokalnego state.
 *
 * Indicator "Sprzedawca edytuje teraz · {Name}" jest oparty o
 * `service.editor_heartbeat` (10s cadence). Brak heartbeatu przez 30s →
 * editor uznawany za rozłączonego (server-side sweeper publishuje
 * `service.editor_disconnected`).
 *
 * Read-only enforcement: brak handlerów mutujących, brak importu
 * mutation endpoints. Pure reactive view.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Radio, X } from "lucide-react";
import { subscribeToService, type SsePushEvent } from "@/lib/sse-client";

interface ServicePreviewData {
  id: string;
  ticketNumber: string;
  brand: string | null;
  model: string | null;
  imei: string | null;
  color: string | null;
  lockType: string | null;
  lockCode: string | null;
  description: string | null;
  amountEstimate: number | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  visualCondition?: Record<string, unknown> | null;
  // F15 dynamic fields — eventy mogą wpłynąć z innymi nazwami
  // (repairTypes jako array kodów, customDescription itd.).
  [key: string]: unknown;
}

interface EditorPresenceState {
  byUserId: string;
  byUserEmail: string;
  byUserName: string;
  byUserRole: "sales" | "service";
  lastSeenMs: number;
  /** Server-side timeout — po nim treat as disconnected. */
  status: "active" | "disconnected";
}

interface Props {
  serviceId: string;
  /** Optional close handler — gdy preview otwarty w drawer/modal. */
  onClose?: () => void;
}

const HIGHLIGHT_MS = 1500;
/** Mirror PRESENCE_TIMEOUT_MS z lib/editor-presence.ts. */
const PRESENCE_TIMEOUT_MS = 30_000;

const FIELD_LABELS: Record<string, string> = {
  brand: "Marka",
  model: "Model",
  imei: "IMEI",
  color: "Kolor",
  lockType: "Blokada",
  lockCode: "Kod blokady",
  visualCondition: "Stan wizualny",
  repairTypes: "Typy napraw",
  customDescription: "Opis problemu",
  amountEstimate: "Wycena",
  customerFirstName: "Imię klienta",
  customerLastName: "Nazwisko klienta",
  contactPhone: "Telefon",
  contactEmail: "Email",
  handoverChoice: "Pobrane przedmioty (typ)",
  handoverItems: "Pobrane przedmioty",
  chosenServiceLocationId: "Punkt serwisowy",
  releaseCodeChannel: "Kanał kodu wydania",
};

function formatValue(field: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (field === "amountEstimate") return `${value.toFixed(2)} zł`;
    return String(value);
  }
  if (Array.isArray(value)) return value.join(" · ") || "—";
  if (typeof value === "object") {
    try {
      const json = JSON.stringify(value);
      return json.length > 80 ? `${json.slice(0, 77)}…` : json;
    } catch {
      return "—";
    }
  }
  return String(value);
}

function timeSince(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 5) return "przed chwilą";
  if (sec < 60) return `${sec}s temu`;
  const min = Math.floor(sec / 60);
  return `${min} min temu`;
}

export function LiveServicePreview({ serviceId, onClose }: Props) {
  const [data, setData] = useState<ServicePreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorPresenceState | null>(null);
  const [highlights, setHighlights] = useState<Record<string, number>>({});
  /** Tick state — refresh "X sekund temu" co 5s i wykrycie staleness. */
  const [, setTick] = useState(0);
  const highlightTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Initial fetch.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/relay/services/${encodeURIComponent(serviceId)}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as
          | { service?: ServicePreviewData; error?: string }
          | null;
        if (cancelled) return;
        if (!r.ok) {
          setError(j?.error ?? `HTTP ${r.status}`);
          return;
        }
        if (j?.service) setData(j.service);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Błąd sieci");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  // Tick co 3s — odświeża "X sekund temu" oraz status badge gdy heartbeat
  // wygaśnie po stronie klienta (server publishuje editor_disconnected
  // gdy serverowy sweeper zauważy timeout, ale tick działa też gdy SSE
  // dropnie i nie dostajemy disconnect-eventu).
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 3_000);
    return () => clearInterval(t);
  }, []);

  // SSE subscribe — service-scoped.
  useEffect(() => {
    const unsub = subscribeToService(serviceId, (evt: SsePushEvent) => {
      if (evt.type === "service.field_changed") {
        const p = evt.payload as {
          field?: string;
          value?: unknown;
          byUserId?: string;
          byUserEmail?: string;
          byUserName?: string;
          byUserRole?: "sales" | "service";
        };
        if (!p.field) return;
        // Merge field do data (read-only — local state, not persisted).
        setData((prev) => {
          if (!prev) return prev;
          return { ...prev, [p.field as string]: p.value };
        });
        // Highlight animation — 1.5s.
        const field = p.field;
        const existing = highlightTimers.current.get(field);
        if (existing) clearTimeout(existing);
        setHighlights((h) => ({ ...h, [field]: Date.now() }));
        const t = setTimeout(() => {
          highlightTimers.current.delete(field);
          setHighlights((h) => {
            const next = { ...h };
            delete next[field];
            return next;
          });
        }, HIGHLIGHT_MS);
        highlightTimers.current.set(field, t);
        // Field change implicit heartbeat (server marks presence) — refresh
        // editor state too.
        if (p.byUserId && p.byUserName && p.byUserRole) {
          setEditor({
            byUserId: p.byUserId,
            byUserEmail: p.byUserEmail ?? "",
            byUserName: p.byUserName,
            byUserRole: p.byUserRole,
            lastSeenMs: Date.now(),
            status: "active",
          });
        }
        return;
      }
      if (evt.type === "service.editor_heartbeat") {
        const p = evt.payload as {
          byUserId?: string;
          byUserEmail?: string;
          byUserName?: string;
          byUserRole?: "sales" | "service";
          lastSeen?: number;
          replay?: boolean;
        };
        if (!p.byUserId || !p.byUserName || !p.byUserRole) return;
        // Replay event ma `lastSeen` z server cache — nie używaj
        // Date.now() bo to mogłoby ukryć "zaraz wygasa".
        const lastSeenMs =
          p.replay && typeof p.lastSeen === "number" ? p.lastSeen : Date.now();
        setEditor({
          byUserId: p.byUserId,
          byUserEmail: p.byUserEmail ?? "",
          byUserName: p.byUserName,
          byUserRole: p.byUserRole,
          lastSeenMs,
          status: "active",
        });
        return;
      }
      if (evt.type === "service.editor_disconnected") {
        const p = evt.payload as { byUserId?: string };
        setEditor((prev) => {
          if (!prev) return null;
          if (p.byUserId && prev.byUserId !== p.byUserId) return prev;
          return { ...prev, status: "disconnected" };
        });
      }
    });
    return () => {
      unsub();
      // Cleanup highlight timery na unmount.
      for (const t of highlightTimers.current.values()) clearTimeout(t);
      highlightTimers.current.clear();
    };
  }, [serviceId]);

  // Derived: czy heartbeat wygasł lokalnie (defense-in-depth gdy SSE drop).
  const editorEffectiveStatus = useMemo<
    "active" | "disconnected" | "stale"
  >(() => {
    if (!editor) return "disconnected";
    if (editor.status === "disconnected") return "disconnected";
    const age = Date.now() - editor.lastSeenMs;
    if (age > PRESENCE_TIMEOUT_MS) return "stale";
    return "active";
  }, [editor]);

  if (loading) {
    return (
      <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>
        Ładowanie podglądu…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6 text-sm" style={{ color: "#ef4444" }}>
        Nie udało się załadować podglądu: {error ?? "brak danych"}
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <Header
        ticketNumber={data.ticketNumber}
        editor={editor}
        status={editorEffectiveStatus}
        onClose={onClose}
      />
      <div className="p-4 space-y-3">
        <FieldRow
          field="brand"
          value={data.brand}
          highlightedAt={highlights.brand}
        />
        <FieldRow
          field="model"
          value={data.model}
          highlightedAt={highlights.model}
        />
        <FieldRow
          field="imei"
          value={data.imei}
          highlightedAt={highlights.imei}
        />
        <FieldRow
          field="color"
          value={data.color}
          highlightedAt={highlights.color}
        />
        <FieldRow
          field="lockType"
          value={data.lockType}
          highlightedAt={highlights.lockType}
        />
        <FieldRow
          field="lockCode"
          value={data.lockCode}
          highlightedAt={highlights.lockCode}
        />
        <FieldRow
          field="visualCondition"
          value={data.visualCondition}
          highlightedAt={highlights.visualCondition}
        />
        <FieldRow
          field="repairTypes"
          value={data.repairTypes}
          highlightedAt={highlights.repairTypes}
        />
        <FieldRow
          field="customDescription"
          value={data.customDescription ?? data.description}
          highlightedAt={highlights.customDescription}
        />
        <FieldRow
          field="amountEstimate"
          value={data.amountEstimate}
          highlightedAt={highlights.amountEstimate}
        />
        <div
          className="border-t pt-3 mt-3"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <p
            className="text-[10px] uppercase tracking-wider mb-2 font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            Klient
          </p>
        </div>
        <FieldRow
          field="customerFirstName"
          value={data.customerFirstName}
          highlightedAt={highlights.customerFirstName}
        />
        <FieldRow
          field="customerLastName"
          value={data.customerLastName}
          highlightedAt={highlights.customerLastName}
        />
        <FieldRow
          field="contactPhone"
          value={data.contactPhone}
          highlightedAt={highlights.contactPhone}
        />
        <FieldRow
          field="contactEmail"
          value={data.contactEmail}
          highlightedAt={highlights.contactEmail}
        />
      </div>
      <div
        className="px-4 py-2 text-[10px] border-t"
        style={{
          background: "rgba(120,120,135,0.06)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        <Eye className="w-3 h-3 inline mr-1" />
        Tylko podgląd. Zmiany sprzedawcy są widoczne na żywo, ale ten widok
        nie pozwala edytować.
      </div>
    </div>
  );
}

function Header({
  ticketNumber,
  editor,
  status,
  onClose,
}: {
  ticketNumber: string;
  editor: EditorPresenceState | null;
  status: "active" | "disconnected" | "stale";
  onClose?: () => void;
}) {
  const showActive = editor && status === "active";
  return (
    <div
      className="px-4 py-3 border-b flex items-center justify-between"
      style={{
        background: showActive
          ? "linear-gradient(90deg, rgba(34,197,94,0.10), transparent)"
          : "transparent",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Podgląd na żywo · {ticketNumber}
        </div>
        {editor && (
          <EditorBadge
            name={editor.byUserName}
            role={editor.byUserRole}
            status={status}
            lastSeenMs={editor.lastSeenMs}
          />
        )}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Zamknij podgląd"
          className="p-1 rounded-lg transition-colors hover:bg-[rgba(120,120,135,0.12)]"
          style={{ color: "var(--text-muted)" }}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function EditorBadge({
  name,
  role,
  status,
  lastSeenMs,
}: {
  name: string;
  role: "sales" | "service";
  status: "active" | "disconnected" | "stale";
  lastSeenMs: number;
}) {
  const roleLabel = role === "sales" ? "Sprzedawca" : "Serwisant";
  let label: string;
  let color: string;
  let pulse = false;
  if (status === "active") {
    label = `${roleLabel} edytuje teraz · ${name}`;
    color = "#22C55E";
    pulse = true;
  } else if (status === "stale") {
    label = `${roleLabel} ${name} — brak heartbeatu (${timeSince(lastSeenMs)})`;
    color = "#f59e0b";
  } else {
    label = `${roleLabel} ${name} rozłączył się`;
    color = "#94a3b8";
  }
  return (
    <div
      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full"
      style={{
        background: `${color}1A`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      <Radio
        className={`w-3 h-3 ${pulse ? "animate-pulse" : ""}`}
        aria-hidden
      />
      <span>{label}</span>
    </div>
  );
}

function FieldRow({
  field,
  value,
  highlightedAt,
}: {
  field: string;
  value: unknown;
  highlightedAt?: number;
}) {
  const label = FIELD_LABELS[field] ?? field;
  const highlighted = !!highlightedAt;
  return (
    <div
      className="flex items-baseline justify-between gap-3 transition-colors rounded-md px-2 py-1"
      style={{
        background: highlighted ? "rgba(34,197,94,0.10)" : "transparent",
      }}
    >
      <span
        className="text-[11px] uppercase tracking-wide font-semibold w-1/3 shrink-0"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <span
        className="text-sm text-right break-words"
        style={{
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatValue(field, value)}
      </span>
    </div>
  );
}
