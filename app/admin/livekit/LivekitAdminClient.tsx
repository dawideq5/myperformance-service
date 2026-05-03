"use client";

/**
 * Wave 23 — /admin/livekit client.
 *
 * Auto-refresh co 5s. Dla każdego pokoju pokazujemy:
 *   - room name + status (waiting/active),
 *   - sprzedawca który zainicjował (requestedByEmail),
 *   - czas trwania (LIVE) lub czas oczekiwania (waiting),
 *   - service / chatwoot conversation links (gdy są),
 *   - liczba uczestników w LiveKit (jeśli reachable).
 *
 * Akcje per pokój:
 *   - "Dołącz" → POST /api/admin/livekit/admin-join-token (mintuje signed
 *     joinToken z identity="Admin (<email>)") → otwiera /konsultacja/<room>
 *     w nowej karcie. Subscriber-only (admin nigdy nie publishuje).
 *   - "Zakończ" → POST /api/admin/livekit/end-room (force deleteRoom).
 */

import { useCallback, useEffect, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Radio,
  RefreshCw,
  Square,
  Video,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";

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
  liveParticipants: number | null;
}

interface RoomsResponse {
  rooms: RoomRow[];
  liveKitReachable: boolean;
  timestamp: string;
}

interface Props {
  userLabel: string;
  userEmail?: string;
}

const REFRESH_MS = 5_000;

export function LivekitAdminClient({ userLabel, userEmail }: Props) {
  const [rows, setRows] = useState<RoomRow[]>([]);
  const [liveKitReachable, setLiveKitReachable] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [endingRoom, setEndingRoom] = useState<string | null>(null);
  const [joiningRoom, setJoiningRoom] = useState<string | null>(null);

  const fetchRooms = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch("/api/admin/livekit/rooms", {
        cache: "no-store",
        signal,
      });
      const body = (await r.json()) as { data?: RoomsResponse; error?: { message?: string } };
      if (!r.ok) {
        throw new Error(body.error?.message ?? `HTTP ${r.status}`);
      }
      const data = body.data ?? { rooms: [], liveKitReachable: false, timestamp: "" };
      setRows(data.rooms);
      setLiveKitReachable(data.liveKitReachable);
      setError(null);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setError(
        err instanceof Error ? err.message : "Nie udało się pobrać listy pokoi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void fetchRooms(ac.signal);
    const id = window.setInterval(() => void fetchRooms(), REFRESH_MS);
    return () => {
      ac.abort();
      window.clearInterval(id);
    };
  }, [fetchRooms]);

  const adminJoin = useCallback(
    async (roomName: string) => {
      setJoiningRoom(roomName);
      try {
        const r = await fetch("/api/admin/livekit/admin-join-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomName }),
        });
        const body = (await r.json()) as {
          data?: { joinUrl: string };
          error?: { message?: string };
        };
        if (!r.ok || !body.data?.joinUrl) {
          throw new Error(body.error?.message ?? `HTTP ${r.status}`);
        }
        window.open(body.data.joinUrl, "_blank", "noopener,noreferrer");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Nie udało się wygenerować linka.",
        );
      } finally {
        setJoiningRoom(null);
      }
    },
    [],
  );

  const endRoom = useCallback(
    async (roomName: string) => {
      if (
        !window.confirm(
          `Na pewno zakończyć pokój "${roomName}"? Wszyscy uczestnicy zostaną rozłączeni.`,
        )
      )
        return;
      setEndingRoom(roomName);
      try {
        const r = await fetch("/api/admin/livekit/end-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomName }),
        });
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          throw new Error(body.error?.message ?? `HTTP ${r.status}`);
        }
        await fetchRooms();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Nie udało się zakończyć pokoju.",
        );
      } finally {
        setEndingRoom(null);
      }
    },
    [fetchRooms],
  );

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <AppHeader
        userLabel={userLabel}
        userSubLabel={userEmail}
        title="LiveKit — aktywne pokoje"
        backHref="/admin/config"
        parentHref="/admin/config"
        parentLabel="Konfiguracja"
      />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Auto-refresh co 5 s · {liveKitReachable ? "LiveKit dostępny" : "LiveKit niedostępny (DB-only)"}
          </p>
          <button
            type="button"
            onClick={() => void fetchRooms()}
            className="px-2.5 py-1.5 rounded-lg text-xs inline-flex items-center gap-1.5"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text)",
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Odśwież
          </button>
        </div>

        {loading && rows.length === 0 ? (
          <div
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Ładowanie…
          </div>
        ) : rows.length === 0 ? (
          <div
            className="rounded-xl p-8 text-center text-sm"
            style={{
              background: "var(--surface)",
              border: "1px dashed var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            Brak aktywnych konsultacji video.
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <RoomCard
                key={r.id}
                row={r}
                liveKitReachable={liveKitReachable}
                onEnd={() => void endRoom(r.roomName)}
                onJoin={() => void adminJoin(r.roomName)}
                ending={endingRoom === r.roomName}
                joining={joiningRoom === r.roomName}
              />
            ))}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 text-xs px-3 py-2 rounded-lg"
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              color: "#fca5a5",
              border: "1px solid rgba(239, 68, 68, 0.4)",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function RoomCard({
  row,
  liveKitReachable,
  onEnd,
  onJoin,
  ending,
  joining,
}: {
  row: RoomRow;
  liveKitReachable: boolean;
  onEnd: () => void;
  onJoin: () => void;
  ending: boolean;
  joining: boolean;
}) {
  const since = row.startedAt ?? row.createdAt;
  const startedMs = since ? Date.parse(since) : 0;
  const elapsedSec = startedMs ? Math.floor((Date.now() - startedMs) / 1000) : 0;
  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-rose-400" aria-hidden="true" />
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              background:
                row.status === "active"
                  ? "rgba(16, 185, 129, 0.15)"
                  : "rgba(245, 158, 11, 0.15)",
              color:
                row.status === "active"
                  ? "var(--success, #10b981)"
                  : "var(--warning, #f59e0b)",
            }}
          >
            {row.status === "active" ? "TRWA" : "OCZEKUJE"}
          </span>
        </div>
        {liveKitReachable && row.liveParticipants !== null && (
          <span
            className="text-[10px] inline-flex items-center gap-1"
            style={{ color: "var(--text-muted)" }}
          >
            <Radio className="w-3 h-3" aria-hidden="true" />
            {row.liveParticipants} uczestn.
          </span>
        )}
      </div>
      <p
        className="text-xs font-mono truncate mb-2"
        title={row.roomName}
        style={{ color: "var(--text)" }}
      >
        {row.roomName}
      </p>
      <dl
        className="space-y-1 text-xs mb-3"
        style={{ color: "var(--text-muted)" }}
      >
        <div>
          <dt className="inline">Sprzedawca: </dt>
          <dd className="inline" style={{ color: "var(--text)" }}>
            {row.requestedByEmail}
          </dd>
        </div>
        {row.serviceId && (
          <div>
            <dt className="inline">Service: </dt>
            <dd
              className="inline font-mono text-[10px]"
              style={{ color: "var(--text)" }}
            >
              {row.serviceId.slice(0, 8)}…
            </dd>
          </div>
        )}
        {row.chatwootConversationId && (
          <div>
            <dt className="inline">Chatwoot: </dt>
            <dd className="inline" style={{ color: "var(--text)" }}>
              #{row.chatwootConversationId}
            </dd>
          </div>
        )}
        <div>
          <dt className="inline">
            {row.status === "active" ? "Trwa: " : "Czeka: "}
          </dt>
          <dd className="inline" style={{ color: "var(--text)" }}>
            {minutes}m {seconds}s
          </dd>
        </div>
      </dl>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onJoin}
          disabled={joining || row.status !== "active"}
          className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          style={{
            background: "rgba(59, 130, 246, 0.15)",
            color: "#3b82f6",
          }}
          title={
            row.status === "active"
              ? "Otwórz konsultację jako subscriber-only"
              : "Pokój nie jest aktywny"
          }
        >
          {joining ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          Dołącz
        </button>
        <button
          type="button"
          onClick={onEnd}
          disabled={ending}
          className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
          style={{
            background: "rgba(239, 68, 68, 0.15)",
            color: "#ef4444",
          }}
        >
          {ending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Square className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          Zakończ
        </button>
      </div>
    </div>
  );
}
