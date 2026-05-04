"use client";

/**
 * Wave 24 — IntakePreviewClient (real-time + dark theme + pełen widok).
 *
 * Embedded jako iframe w Chatwoot Dashboard App. Kontekst (conv id +
 * service_id custom attribute) przychodzi przez `postMessage` z parent
 * window — Chatwoot Frame.vue NIE robi template substitution w URL.
 *
 * Real-time updates przez SSE — każdy POST /api/panel/intake-drafts po
 * stronie sprzedawcy publikuje "intake_draft_changed" do bus, my
 * nasłuchujemy przez EventSource('/api/livekit/conversation-snapshot/stream').
 * Sprzedawca pisze literkę → 200ms debounce → POST → bus → SSE → refetch
 * → user widzi literkę w Chatwoocie w ~150 ms.
 *
 * Pełen widok zlecenia (Wave 24/B):
 *  - Klient (imię, nazwisko, telefon, email)
 *  - Urządzenie (marka, model, IMEI, kolor, blokada)
 *  - Stan urządzenia (DevicePreview3D z markerami uszkodzeń + ratings text)
 *  - Opis usterki + repair types
 *  - Wycena (priceLines + total)
 *  - Status zlecenia (gdy serviceId istnieje)
 *  - Konsultacja video (JoinModeSelector)
 *
 * Inicjacja rozmowy video — TYLKO po stronie agenta Chatwoot.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Radio, Video } from "lucide-react";

import { JoinModeSelector } from "@/components/livekit/JoinModeSelector";
import { DevicePreview3D } from "./components/DevicePreview3D";

interface ConversationSnapshotResponse {
  conversationId: number;
  kind: "draft" | "service" | "merged" | "empty";
  snapshot: SnapshotShape | null;
  initiateToken?: string | null;
  error?: string;
}

interface PriceLine {
  code?: string;
  label?: string;
  amount?: number | null;
  amountGross?: number | null;
  [k: string]: unknown;
}

interface SnapshotShape {
  serviceId: string | null;
  ticketNumber: string | null;
  status: string | null;
  brand: string | null;
  model: string | null;
  imei: string | null;
  color: string | null;
  lockType: string | null;
  description: string | null;
  diagnosis: string | null;
  amountEstimate: number | null;
  amountFinal: number | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  receivedBy: string | null;
  readyToSubmit: boolean;
  visualCondition: Record<string, unknown> | null;
  visualCompleted: boolean;
  intakeChecklist: Record<string, unknown> | null;
  repairTypes: string[] | null;
  priceLines: PriceLine[] | null;
  handoverChoice: "none" | "items" | null;
  handoverItems: string | null;
  updatedAt: string | null;
  source: "draft" | "service" | "merged";
}

interface RoomRow {
  id: string;
  roomName: string;
  serviceId: string | null;
  chatwootConversationId: number | null;
  requestedByEmail: string;
  status: "waiting" | "active" | "ended";
  createdAt: string;
}

interface RoomsResponse {
  rooms: RoomRow[];
  error?: string;
}

interface InitiateResponse {
  roomName: string;
  mobilePublisherUrl: string;
  qrCodeDataUrl: string;
  livekitUrl: string;
  joinUrl: string;
  joinToken: string;
  error?: string;
}

const HIGHLIGHT_MS = 1_500;

const STATUS_LABELS: Record<string, string> = {
  draft: "Wersja robocza",
  received: "Przyjęty",
  diagnosing: "Diagnoza",
  awaiting_quote: "Oczekuje wyceny",
  awaiting_parts: "Oczekuje części",
  repairing: "W naprawie",
  testing: "Testy",
  ready: "Gotowy do odbioru",
  delivered: "Wydany",
  on_hold: "Wstrzymany",
  rejected_by_customer: "Odrzucony przez klienta",
  returned_no_repair: "Zwrot bez naprawy",
  closed: "Zamknięty",
  cancelled: "Anulowany",
  archived: "Zarchiwizowany",
};

const LOCK_LABELS: Record<string, string> = {
  none: "Brak",
  pin: "PIN",
  pattern: "Wzór",
  password: "Hasło",
  fingerprint: "Odcisk palca",
  faceid: "Face ID",
};

function formatAmount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)} zł`;
}

function brandColorFor(brand: string | null): string {
  // Best-effort fallback — brand-specific color w pełnym katalogu jest po
  // stronie BrandPicker w panelu, tu wystarczy cool tint.
  if (!brand) return "#6366f1";
  const lc = brand.toLowerCase();
  if (lc.includes("apple")) return "#0f0f17";
  if (lc.includes("samsung")) return "#1428a0";
  if (lc.includes("xiaomi")) return "#ff6900";
  if (lc.includes("huawei")) return "#cc0000";
  if (lc.includes("oneplus")) return "#eb0028";
  return "#6366f1";
}

const SHELL_STYLE: React.CSSProperties = {
  minHeight: "100vh",
  padding: 12,
  background: "var(--bg-main)",
  color: "var(--text-main)",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 12,
};

const SECTION_STYLE: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 8,
  padding: 12,
  marginBottom: 8,
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "var(--text-muted)",
  marginBottom: 8,
};

export function IntakePreviewClient({
  serviceId: serviceIdFromQuery,
  conversationId: conversationIdFromQuery,
}: {
  serviceId: string;
  conversationId: number | null;
}) {
  const [conversationId, setConversationId] = useState<number | null>(
    conversationIdFromQuery,
  );
  const [serviceId, setServiceId] = useState<string>(serviceIdFromQuery);

  // PostMessage listener — Chatwoot Frame.vue postMessages appContext po @load.
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      let parsed: unknown;
      try {
        parsed =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      const p = parsed as { event?: unknown; data?: unknown };
      if (p.event !== "appContext") return;
      const ctx = p.data as
        | {
            conversation?: {
              id?: unknown;
              custom_attributes?: { service_id?: unknown };
            };
          }
        | undefined;
      const convId = ctx?.conversation?.id;
      if (typeof convId === "number" && convId > 0) {
        setConversationId(convId);
      }
      const customSvc = ctx?.conversation?.custom_attributes?.service_id;
      if (typeof customSvc === "string" && customSvc.trim()) {
        setServiceId(customSvc.trim());
      }
    };
    window.addEventListener("message", onMessage);
    try {
      window.parent.postMessage("chatwoot-dashboard-app:fetch-info", "*");
    } catch {
      // standalone mode
    }
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const [data, setData] = useState<SnapshotShape | null>(null);
  const [snapshotKind, setSnapshotKind] = useState<
    "draft" | "service" | "merged" | "empty" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [highlights, setHighlights] = useState<Record<string, number>>({});
  const [initiateToken, setInitiateToken] = useState<string | null>(null);
  const [resolvedServiceId, setResolvedServiceId] =
    useState<string>(serviceIdFromQuery);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [perRoomJoin, setPerRoomJoin] = useState<
    Record<string, { joinToken: string }>
  >({});
  const [initiating, setInitiating] = useState<boolean>(false);
  const [streamConnected, setStreamConnected] = useState<boolean>(false);
  const prevDataRef = useRef<SnapshotShape | null>(null);

  const refetchSnapshot = useCallback(async (): Promise<void> => {
    if (conversationId == null && !serviceId) return;
    try {
      let body: {
        snapshot: SnapshotShape | null;
        kind: ConversationSnapshotResponse["kind"];
        initiateToken?: string | null;
      };
      if (conversationId != null) {
        const r = await fetch(
          `/api/livekit/conversation-snapshot?conversation_id=${conversationId}`,
          { cache: "no-store" },
        );
        const json = (await r.json()) as ConversationSnapshotResponse;
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
        body = {
          snapshot: json.snapshot,
          kind: json.kind,
          initiateToken: json.initiateToken,
        };
      } else {
        const r = await fetch(
          `/api/livekit/intake-snapshot?service_id=${encodeURIComponent(serviceId)}`,
          { cache: "no-store" },
        );
        const json = (await r.json()) as {
          service?: SnapshotShape & { id: string };
          initiateToken?: string | null;
          error?: string;
        };
        if (!r.ok || !json.service) {
          throw new Error(json.error ?? `HTTP ${r.status}`);
        }
        body = {
          snapshot: json.service,
          kind: "service",
          initiateToken: json.initiateToken,
        };
      }
      setSnapshotKind(body.kind);
      if (body.snapshot) {
        const next = body.snapshot;
        const prev = prevDataRef.current;
        if (prev) {
          const changed: Record<string, number> = {};
          const keys: Array<keyof SnapshotShape> = [
            "ticketNumber",
            "status",
            "brand",
            "model",
            "imei",
            "color",
            "lockType",
            "description",
            "amountEstimate",
            "customerFirstName",
            "customerLastName",
            "contactPhone",
            "contactEmail",
          ];
          for (const k of keys) {
            if (prev[k] !== next[k]) changed[k as string] = Date.now();
          }
          if (Object.keys(changed).length > 0) {
            setHighlights((p) => ({ ...p, ...changed }));
          }
        }
        prevDataRef.current = next;
        setData(next);
        if (next.serviceId) setResolvedServiceId(next.serviceId);
      } else {
        setData(null);
        prevDataRef.current = null;
      }
      if (typeof body.initiateToken === "string" && body.initiateToken) {
        setInitiateToken(body.initiateToken);
      }
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nie udało się pobrać podglądu.",
      );
    } finally {
      setLoading(false);
    }
  }, [conversationId, serviceId]);

  useEffect(() => {
    if (conversationId == null && !serviceId) {
      const id = window.setTimeout(() => {
        setError(
          "Brak kontekstu konwersacji. Otwórz tę aplikację z poziomu rozmowy w Chatwoocie.",
        );
        setLoading(false);
      }, 5000);
      return () => window.clearTimeout(id);
    }

    void refetchSnapshot();

    if (conversationId == null) return;
    const es = new EventSource(
      `/api/livekit/conversation-snapshot/stream?conversation_id=${conversationId}`,
    );
    es.addEventListener("open", () => setStreamConnected(true));
    es.addEventListener("error", () => setStreamConnected(false));
    es.addEventListener("intake_draft_changed", () => {
      void refetchSnapshot();
    });
    return () => es.close();
  }, [conversationId, serviceId, refetchSnapshot]);

  // Polling pokoi LiveKit — 5 s.
  useEffect(() => {
    if (!resolvedServiceId && conversationId == null) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const param =
          conversationId != null
            ? `conversation_id=${conversationId}`
            : `service_id=${encodeURIComponent(resolvedServiceId)}`;
        const r = await fetch(`/api/livekit/rooms-for-service?${param}`, {
          cache: "no-store",
        });
        const body = (await r.json()) as RoomsResponse;
        if (!r.ok) return;
        if (cancelled) return;
        setRooms(body.rooms);
      } catch {
        // best-effort
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [resolvedServiceId, conversationId]);

  useEffect(() => {
    if (!initiateToken || rooms.length === 0) return;
    let cancelled = false;
    const missing = rooms.filter(
      (r) => r.status !== "ended" && !perRoomJoin[r.roomName],
    );
    void (async () => {
      for (const room of missing) {
        if (cancelled) break;
        try {
          const r = await fetch(`/api/livekit/agent-join-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initiateToken, roomName: room.roomName }),
          });
          const body = (await r.json()) as {
            joinToken?: string;
            error?: string;
          };
          if (!r.ok || !body.joinToken) continue;
          if (cancelled) break;
          setPerRoomJoin((prev) => ({
            ...prev,
            [room.roomName]: { joinToken: body.joinToken! },
          }));
        } catch {
          // best-effort
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rooms, initiateToken, perRoomJoin]);

  const initiate = useCallback(async () => {
    if (!initiateToken) {
      setError("Brak tokenu inicjacji — odśwież widok.");
      return;
    }
    setInitiating(true);
    try {
      const r = await fetch(`/api/livekit/start-from-chatwoot-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initiateToken,
          conversationId,
        }),
      });
      const body = (await r.json()) as InitiateResponse;
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      setPerRoomJoin((prev) => ({
        ...prev,
        [body.roomName]: { joinToken: body.joinToken },
      }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Nie udało się rozpocząć rozmowy.",
      );
    } finally {
      setInitiating(false);
    }
  }, [initiateToken, conversationId]);

  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => forceTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, []);

  const activeHighlights = useMemo(() => {
    const now = Date.now();
    const live: Record<string, true> = {};
    for (const [k, ts] of Object.entries(highlights)) {
      if (now - ts < HIGHLIGHT_MS) live[k] = true;
    }
    return live;
  }, [highlights]);

  // Total wyceny — useMemo MUSI być wołany przed early returns (rules of hooks).
  const totalEstimate = useMemo(() => {
    const lines = data?.priceLines;
    const fallback = data?.amountEstimate ?? null;
    if (!lines || lines.length === 0) return fallback;
    let total = 0;
    let any = false;
    for (const line of lines) {
      const v =
        typeof line.amountGross === "number"
          ? line.amountGross
          : typeof line.amount === "number"
            ? line.amount
            : null;
      if (typeof v === "number" && Number.isFinite(v)) {
        total += v;
        any = true;
      }
    }
    return any ? total : fallback;
  }, [data?.priceLines, data?.amountEstimate]);

  if (loading) {
    return (
      <main style={SHELL_STYLE}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 200,
            color: "var(--text-muted)",
            gap: 8,
          }}
        >
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Łączenie z podglądem…
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main style={SHELL_STYLE}>
        <div
          role="alert"
          style={{
            padding: 12,
            borderRadius: 8,
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            color: "#fca5a5",
          }}
        >
          {error}
        </div>
      </main>
    );
  }

  if (!data && conversationId != null) {
    return (
      <main style={SHELL_STYLE}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingBottom: 12,
            marginBottom: 12,
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <Radio
            className="w-3.5 h-3.5 animate-pulse"
            style={{ color: "var(--accent)" }}
            aria-hidden="true"
          />
          <h1 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
            Oczekiwanie na sprzedawcę
          </h1>
        </header>
        <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>
          Sprzedawca jeszcze nie zaczął wypełniać formularza intake.
          Możesz zainicjować rozmowę video już teraz.
        </p>
        <PrimaryButton
          onClick={() => void initiate()}
          disabled={initiating || !initiateToken}
          loading={initiating}
          icon={<Video className="w-3.5 h-3.5" aria-hidden="true" />}
        >
          Rozpocznij rozmowę video
        </PrimaryButton>
        <ConnectionBadge connected={streamConnected} />
      </main>
    );
  }

  if (!data) {
    return (
      <main style={SHELL_STYLE}>
        <div style={{ color: "var(--text-muted)", textAlign: "center" }}>
          Brak danych.
        </div>
      </main>
    );
  }

  const customerName =
    [data.customerFirstName, data.customerLastName]
      .filter((s) => s && String(s).trim())
      .join(" ") || "—";
  const isDraft = snapshotKind === "draft" || snapshotKind === "empty";
  const statusLabel =
    data.status && STATUS_LABELS[data.status]
      ? STATUS_LABELS[data.status]
      : data.status ?? "—";

  const visualCondition =
    (data.visualCondition as Record<string, unknown> | null) ?? null;
  const damageMarkers = Array.isArray(visualCondition?.damage_markers)
    ? (visualCondition!.damage_markers as Array<{ description?: string }>).filter(
        (m) => m && typeof m === "object",
      )
    : [];

  return (
    <main style={SHELL_STYLE}>
      <header
        style={{
          paddingBottom: 12,
          marginBottom: 12,
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Radio
            className="w-3.5 h-3.5 animate-pulse"
            style={{ color: isDraft ? "#f59e0b" : "var(--accent)" }}
            aria-hidden="true"
          />
          <h1 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
            {isDraft
              ? "Wersja robocza intake (live)"
              : `Konsultacja serwisowa #${data.ticketNumber}`}
          </h1>
        </div>
        <p
          style={{
            color: "var(--text-muted)",
            margin: "4px 0 0 0",
            fontSize: 11,
          }}
        >
          Status: <strong style={{ color: "var(--text-main)" }}>{statusLabel}</strong>
          {data.receivedBy ? <> · Przyjął: {data.receivedBy}</> : null}
        </p>
      </header>

      {/* Klient */}
      <section style={SECTION_STYLE}>
        <h2 style={SECTION_TITLE}>Klient</h2>
        <FieldRow
          label="Imię i nazwisko"
          value={customerName}
          highlighted={
            activeHighlights.customerFirstName ||
            activeHighlights.customerLastName
          }
        />
        <FieldRow
          label="Telefon"
          value={data.contactPhone ?? "—"}
          highlighted={activeHighlights.contactPhone}
        />
        <FieldRow
          label="Email"
          value={data.contactEmail ?? "—"}
          highlighted={activeHighlights.contactEmail}
        />
      </section>

      {/* Urządzenie */}
      <section style={SECTION_STYLE}>
        <h2 style={SECTION_TITLE}>Urządzenie</h2>
        <FieldRow
          label="Marka"
          value={data.brand ?? "—"}
          highlighted={activeHighlights.brand}
        />
        <FieldRow
          label="Model"
          value={data.model ?? "—"}
          highlighted={activeHighlights.model}
        />
        <FieldRow
          label="IMEI"
          value={data.imei ?? "—"}
          mono
          highlighted={activeHighlights.imei}
        />
        <FieldRow
          label="Kolor"
          value={data.color ?? "—"}
          highlighted={activeHighlights.color}
        />
        <FieldRow
          label="Blokada"
          value={
            data.lockType
              ? LOCK_LABELS[data.lockType] ?? data.lockType
              : "—"
          }
          highlighted={activeHighlights.lockType}
        />
      </section>

      {/* Stan urządzenia 3D */}
      <section style={SECTION_STYLE}>
        <h2 style={SECTION_TITLE}>
          Stan urządzenia
          {damageMarkers.length > 0 ? (
            <span
              style={{
                marginLeft: 6,
                background: "rgba(239, 68, 68, 0.15)",
                color: "#fca5a5",
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: 9,
              }}
            >
              {damageMarkers.length}{" "}
              {damageMarkers.length === 1 ? "uszkodzenie" : "uszkodzeń"}
            </span>
          ) : null}
        </h2>
        <DevicePreview3D
          brandColorHex={brandColorFor(data.brand)}
          visualCondition={visualCondition}
        />
        {damageMarkers.length > 0 && (
          <ul
            style={{
              marginTop: 8,
              padding: 0,
              listStyle: "none",
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            {damageMarkers.map((m, i) => (
              <li
                key={i}
                style={{
                  padding: "2px 0",
                  borderBottom:
                    i < damageMarkers.length - 1
                      ? "1px dashed var(--border-subtle)"
                      : "none",
                }}
              >
                <span style={{ color: "#fca5a5" }}>●</span>{" "}
                {m.description?.trim() || "Bez opisu"}
              </li>
            ))}
          </ul>
        )}
        <RatingsList visualCondition={visualCondition} />
      </section>

      {/* Opis usterki + repair types */}
      <section style={SECTION_STYLE}>
        <h2 style={SECTION_TITLE}>Opis usterki</h2>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "var(--text-main)",
            whiteSpace: "pre-wrap",
            background: activeHighlights.description
              ? "var(--accent-soft)"
              : "transparent",
            padding: 6,
            borderRadius: 4,
            transition: "background 200ms ease",
          }}
        >
          {data.description?.trim() || "—"}
        </p>
        {data.repairTypes && data.repairTypes.length > 0 && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            {data.repairTypes.map((code) => (
              <span
                key={code}
                style={{
                  padding: "2px 8px",
                  borderRadius: 12,
                  background: "var(--accent-soft)",
                  border: "1px solid var(--accent-border)",
                  color: "var(--accent)",
                  fontSize: 10,
                  fontWeight: 500,
                }}
              >
                {code}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Wycena */}
      <section style={SECTION_STYLE}>
        <h2 style={SECTION_TITLE}>Wycena</h2>
        {data.priceLines && data.priceLines.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {data.priceLines.map((line, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "var(--text-main)",
                }}
              >
                <span>
                  {String(line.label ?? line.code ?? "Pozycja")}
                </span>
                <span style={{ fontFamily: "monospace" }}>
                  {formatAmount(
                    typeof line.amountGross === "number"
                      ? line.amountGross
                      : typeof line.amount === "number"
                        ? line.amount
                        : null,
                  )}
                </span>
              </div>
            ))}
            <div
              style={{
                marginTop: 4,
                paddingTop: 4,
                borderTop: "1px solid var(--border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span>Razem</span>
              <span style={{ fontFamily: "monospace", color: "var(--accent)" }}>
                {formatAmount(totalEstimate)}
              </span>
            </div>
          </div>
        ) : (
          <FieldRow
            label="Wycena szacunkowa"
            value={formatAmount(data.amountEstimate)}
            highlighted={activeHighlights.amountEstimate}
            mono
          />
        )}
        {data.amountFinal != null && (
          <FieldRow label="Kwota końcowa" value={formatAmount(data.amountFinal)} mono />
        )}
      </section>

      {/* Handover */}
      {data.handoverChoice && (
        <section style={SECTION_STYLE}>
          <h2 style={SECTION_TITLE}>Potwierdzenie odbioru</h2>
          {data.handoverChoice === "none" ? (
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
              Sprzedawca potwierdził: brak SIM, karty SD, etui w urządzeniu.
            </p>
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: "var(--text-main)",
                whiteSpace: "pre-wrap",
              }}
            >
              {data.handoverItems?.trim() || "Pobrane przedmioty (brak opisu)"}
            </p>
          )}
        </section>
      )}

      {/* Konsultacja video */}
      <section style={SECTION_STYLE}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <h2
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 1,
              color: "var(--text-muted)",
              margin: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Video
              className="w-3.5 h-3.5"
              style={{ color: "var(--accent)" }}
              aria-hidden="true"
            />
            Rozmowa video
          </h2>
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
            {rooms.length === 0
              ? "Brak aktywnych"
              : `${rooms.length} aktywna${rooms.length > 1 ? "/-e" : ""}`}
          </span>
        </div>

        {rooms.length === 0 && (
          <PrimaryButton
            onClick={() => void initiate()}
            disabled={initiating || !initiateToken}
            loading={initiating}
            icon={<Video className="w-3.5 h-3.5" aria-hidden="true" />}
          >
            Rozpocznij rozmowę video
          </PrimaryButton>
        )}

        {rooms.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rooms.map((r) => {
              const cached = perRoomJoin[r.roomName];
              return (
                <div
                  key={r.id}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 6,
                    padding: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: 10,
                        color: "var(--text-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.roomName}
                    </span>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                        background:
                          r.status === "active"
                            ? "rgba(16, 185, 129, 0.15)"
                            : "rgba(245, 158, 11, 0.15)",
                        color: r.status === "active" ? "#10b981" : "#f59e0b",
                      }}
                    >
                      {r.status === "active" ? "TRWA" : "OCZEKUJE"}
                    </span>
                  </div>
                  {cached ? (
                    <JoinModeSelector
                      roomName={r.roomName}
                      signedJoinToken={cached.joinToken}
                      compact
                      publisherMode="publisher"
                    />
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 10,
                        color: "var(--text-muted)",
                      }}
                    >
                      <Loader2
                        className="w-3 h-3 animate-spin"
                        aria-hidden="true"
                      />
                      Generowanie tokenu dołączenia…
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ConnectionBadge connected={streamConnected} />
    </main>
  );
}

function FieldRow({
  label,
  value,
  highlighted,
  mono,
}: {
  label: string;
  value: string;
  highlighted?: boolean;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "4px 6px",
        borderRadius: 4,
        background: highlighted ? "var(--accent-soft)" : "transparent",
        transition: "background 200ms ease",
        fontSize: 11,
      }}
    >
      <dt style={{ color: "var(--text-muted)", flexShrink: 0 }}>{label}</dt>
      <dd
        style={{
          fontWeight: 500,
          textAlign: "right",
          margin: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "60%",
          fontFamily: mono ? "monospace" : "inherit",
        }}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function RatingsList({
  visualCondition,
}: {
  visualCondition: Record<string, unknown> | null;
}) {
  if (!visualCondition) return null;
  const ratings: Array<[string, unknown, string]> = [
    ["display", visualCondition.display, "Ekran"],
    ["back", visualCondition.back, "Tył"],
    ["frames", visualCondition.frames, "Ramki"],
    ["camera", visualCondition.camera, "Aparat"],
    ["battery", visualCondition.battery, "Bateria"],
  ];
  const items = ratings.filter(([, v]) => typeof v === "number");
  const flags: Array<[string, unknown, string]> = [
    ["charging_works", visualCondition.charging_works, "Ładowanie"],
    ["fingerprint_works", visualCondition.fingerprint_works, "Odcisk palca"],
    ["faceid_works", visualCondition.faceid_works, "Face ID"],
  ];
  const flagItems = flags.filter(([, v]) => v != null);
  if (items.length === 0 && flagItems.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 8,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 4,
        fontSize: 10,
      }}
    >
      {items.map(([key, value, label]) => (
        <div
          key={key}
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "var(--text-muted)",
            padding: "2px 6px",
          }}
        >
          <span>{label}</span>
          <span style={{ color: "var(--text-main)", fontFamily: "monospace" }}>
            {value as number}/5
          </span>
        </div>
      ))}
      {flagItems.map(([key, value, label]) => (
        <div
          key={key}
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "var(--text-muted)",
            padding: "2px 6px",
          }}
        >
          <span>{label}</span>
          <span
            style={{
              color: value ? "#10b981" : "#fca5a5",
              fontFamily: "monospace",
            }}
          >
            {value ? "OK" : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  loading,
  icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "8px 12px",
        borderRadius: 8,
        background: "var(--accent)",
        color: "#fff",
        fontWeight: 500,
        fontSize: 12,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <footer
      style={{
        marginTop: 16,
        paddingTop: 12,
        borderTop: "1px solid var(--border-subtle)",
        textAlign: "center",
        fontSize: 10,
        color: "var(--text-muted)",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: connected ? "#10b981" : "#6b6b7b",
          }}
          aria-hidden="true"
        />
        myperformance.pl ·{" "}
        {connected ? "real-time" : "łączenie…"}
      </span>
    </footer>
  );
}

