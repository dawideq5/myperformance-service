"use client";

/**
 * Wave 23 — IntakePreviewClient
 *
 * Embedded w iframe wewnątrz Chatwoot Dashboard App. Polling co 4s
 * `/api/livekit/intake-snapshot?service_id=…`. Każda zmiana pola → 1.5s
 * zielony highlight (wzór z F15 LiveServicePreview).
 *
 * Bez SSE bo agent Chatwoot nie ma KC sesji (SSE bus wymaga auth).
 * 4s polling jest "almost live" w UX — można dodać SSE w follow-up.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Radio, Video } from "lucide-react";

import { JoinModeSelector } from "@/components/livekit/JoinModeSelector";

interface ServiceSnapshot {
  id: string;
  ticketNumber: string;
  status: string;
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
  chatwootConversationId: number | null;
  updatedAt: string | null;
  createdAt: string | null;
}

interface SnapshotResponse {
  service?: ServiceSnapshot;
  /** Wave 23 (overlay) — short-lived token żeby agent mógł zainicjować rozmowę. */
  initiateToken?: string | null;
  error?: string;
}

interface RoomRow {
  id: string;
  roomName: string;
  serviceId: string | null;
  chatwootConversationId: number | null;
  requestedByEmail: string;
  status: "waiting" | "active" | "ended";
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
}

interface RoomsForServiceResponse {
  rooms: RoomRow[];
  timestamp: string;
  error?: string;
}

interface InitiateResponse {
  roomName: string;
  mobilePublisherUrl: string;
  qrCodeDataUrl: string;
  livekitUrl: string;
  joinUrl: string;
  joinToken: string;
  chatwootMessageSent: boolean;
  expiresAt: string;
  error?: string;
}

const POLL_MS = 4_000;
const HIGHLIGHT_MS = 1_500;

const FIELD_LABELS: Record<keyof ServiceSnapshot, string> = {
  id: "ID",
  ticketNumber: "Nr zlecenia",
  status: "Status",
  brand: "Marka",
  model: "Model",
  imei: "IMEI",
  color: "Kolor",
  lockType: "Blokada",
  description: "Opis usterki",
  diagnosis: "Diagnoza",
  amountEstimate: "Wycena",
  amountFinal: "Kwota końcowa",
  customerFirstName: "Imię klienta",
  customerLastName: "Nazwisko klienta",
  contactPhone: "Telefon",
  contactEmail: "Email",
  receivedBy: "Przyjął",
  chatwootConversationId: "Chatwoot conv.",
  updatedAt: "Zaktualizowano",
  createdAt: "Utworzono",
};

const VISIBLE_FIELDS: Array<keyof ServiceSnapshot> = [
  "ticketNumber",
  "status",
  "customerFirstName",
  "customerLastName",
  "contactPhone",
  "contactEmail",
  "brand",
  "model",
  "imei",
  "color",
  "lockType",
  "description",
  "amountEstimate",
];

function formatValue(field: keyof ServiceSnapshot, value: unknown): string {
  if (value == null || value === "") return "—";
  if (field === "amountEstimate" || field === "amountFinal") {
    if (typeof value === "number") return `${value.toFixed(2)} zł`;
  }
  return String(value);
}

export function IntakePreviewClient({ serviceId }: { serviceId: string }) {
  const [data, setData] = useState<ServiceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [highlights, setHighlights] = useState<Record<string, number>>({});
  const [initiateToken, setInitiateToken] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [perRoomJoin, setPerRoomJoin] = useState<
    Record<string, { joinToken: string; mobileUrl: string; qrDataUrl: string }>
  >({});
  const [initiating, setInitiating] = useState<boolean>(false);
  const prevDataRef = useRef<ServiceSnapshot | null>(null);

  useEffect(() => {
    if (!serviceId) {
      setError("Brak service_id w URL'u.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const fetchOnce = async () => {
      try {
        const r = await fetch(
          `/api/livekit/intake-snapshot?service_id=${encodeURIComponent(serviceId)}`,
          { cache: "no-store" },
        );
        const body = (await r.json()) as SnapshotResponse;
        if (!r.ok || !body.service) {
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        if (cancelled) return;
        const next = body.service;
        const prev = prevDataRef.current;
        if (prev) {
          const changed: Record<string, number> = {};
          for (const k of VISIBLE_FIELDS) {
            if (prev[k] !== next[k]) {
              changed[k] = Date.now();
            }
          }
          if (Object.keys(changed).length > 0) {
            setHighlights((prev) => ({ ...prev, ...changed }));
          }
        }
        prevDataRef.current = next;
        setData(next);
        if (typeof body.initiateToken === "string" && body.initiateToken) {
          setInitiateToken(body.initiateToken);
        }
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Nie udało się pobrać podglądu.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchOnce();
    timer = window.setInterval(() => void fetchOnce(), POLL_MS);
    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
    };
  }, [serviceId]);

  // Wave 23 (overlay) — polling aktywnych pokoi konsultacji video.
  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(
          `/api/livekit/rooms-for-service?service_id=${encodeURIComponent(serviceId)}`,
          { cache: "no-store" },
        );
        const body = (await r.json()) as RoomsForServiceResponse;
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        if (cancelled) return;
        setRooms(body.rooms);
      } catch {
        // ignore — polling jest best-effort.
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [serviceId]);

  /**
   * Wave 23 (overlay) — gdy pojawia się nowy pokój a my nie mamy jeszcze
   * jego joinTokena (np. sprzedawca rozpoczął konsultację, agent dopiero
   * otworzył iframe), mintujemy go przez /api/livekit/agent-join-token.
   * Endpoint waliduje że `roomName` należy do tego samego service_id co
   * `initiateToken` (cross-service guard).
   */
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
            body: JSON.stringify({
              initiateToken,
              roomName: room.roomName,
            }),
          });
          const body = (await r.json()) as {
            joinToken?: string;
            error?: string;
          };
          if (!r.ok || !body.joinToken) {
            // Cross-service room (403) lub ended (410) — pomijamy bez
            // głośnego błędu, polling odświeży listę.
            continue;
          }
          if (cancelled) break;
          setPerRoomJoin((prev) => ({
            ...prev,
            [room.roomName]: {
              joinToken: body.joinToken!,
              mobileUrl: "",
              qrDataUrl: "",
            },
          }));
        } catch {
          // best-effort; polling spróbuje ponownie
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rooms, initiateToken, perRoomJoin]);

  const conversationId =
    typeof data?.chatwootConversationId === "number"
      ? data.chatwootConversationId
      : null;

  const initiate = useCallback(async () => {
    if (!initiateToken) {
      setError("Brak tokenu inicjacji — odśwież iframe.");
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
      // Rejestrujemy join data w cache per-room, żeby JoinModeSelector
      // mógł od razu pokazać UI bez ponownego fetcha.
      setPerRoomJoin((prev) => ({
        ...prev,
        [body.roomName]: {
          joinToken: body.joinToken,
          mobileUrl: body.mobilePublisherUrl,
          qrDataUrl: body.qrCodeDataUrl,
        },
      }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Nie udało się rozpocząć konsultacji.",
      );
    } finally {
      setInitiating(false);
    }
  }, [initiateToken, conversationId]);

  // Highlight cleanup tick — refresh every 500ms żeby fade-out działał.
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

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden="true" />
        Łączenie z podglądem…
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center text-sm text-red-500 p-4 text-center">
        {error}
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Brak danych dla service_id={serviceId}.
      </main>
    );
  }

  const customerName =
    [data.customerFirstName, data.customerLastName]
      .filter((s) => s && s.trim())
      .join(" ") || "—";

  return (
    <main className="min-h-screen p-4 bg-white text-gray-900">
      <header className="mb-3 pb-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Radio
            className="w-3.5 h-3.5 text-emerald-500 animate-pulse"
            aria-hidden="true"
          />
          <h1 className="text-sm font-semibold">
            Konsultacja serwisowa #{data.ticketNumber}
          </h1>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Klient: {customerName}{" "}
          {data.receivedBy && <>· Przyjął: {data.receivedBy}</>}
        </p>
      </header>

      <dl className="space-y-1.5 text-xs">
        {VISIBLE_FIELDS.map((k) => {
          const isHighlighted = activeHighlights[k];
          return (
            <div
              key={k}
              className="flex items-baseline justify-between gap-3 px-1.5 py-1 rounded transition-colors"
              style={{
                background: isHighlighted ? "rgba(16, 185, 129, 0.15)" : "transparent",
              }}
            >
              <dt className="text-gray-500 flex-shrink-0">
                {FIELD_LABELS[k]}
              </dt>
              <dd className="font-medium text-right truncate">
                {formatValue(k, (data as unknown as Record<string, unknown>)[k as string])}
              </dd>
            </div>
          );
        })}
      </dl>

      {/* Wave 23 (overlay) — Konsultacja video */}
      <section className="mt-4 pt-3 border-t border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5 text-rose-500" aria-hidden="true" />
            Konsultacja video
          </h2>
          <span className="text-[10px] text-gray-400">
            {rooms.length === 0
              ? "Brak aktywnych"
              : `${rooms.length} aktywna${rooms.length > 1 ? "/-e" : ""}`}
          </span>
        </div>

        {rooms.length === 0 && (
          <button
            type="button"
            onClick={() => void initiate()}
            disabled={initiating || !initiateToken}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{
              background: "#4f46e5",
              color: "#fff",
            }}
          >
            {initiating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Video className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            Rozpocznij konsultację
          </button>
        )}

        {rooms.length > 0 && (
          <div className="space-y-2">
            {rooms.map((r) => {
              const cached = perRoomJoin[r.roomName];
              return (
                <div
                  key={r.id}
                  className="rounded-lg p-2 text-[11px]"
                  style={{
                    background: "rgba(0,0,0,0.03)",
                    border: "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-mono text-[10px] truncate">
                      {r.roomName}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider"
                      style={{
                        background:
                          r.status === "active"
                            ? "rgba(16, 185, 129, 0.15)"
                            : "rgba(245, 158, 11, 0.15)",
                        color:
                          r.status === "active" ? "#10b981" : "#f59e0b",
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
                    />
                  ) : (
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                      <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                      Generowanie tokenu dołączenia…
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <footer className="mt-4 pt-3 border-t border-gray-200">
        <p className="text-[10px] text-gray-400 text-center">
          myperformance.pl · live preview · auto-refresh co 4 s
        </p>
      </footer>
    </main>
  );
}
