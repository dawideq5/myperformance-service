"use client";

/**
 * Wave 23 — ConsultationVideoSection
 *
 * Sekcja w intake formularzu sprzedawcy. Pozwala rozpocząć konsultację
 * video z agentem Chatwoot (browser camera + microphone). Po starcie:
 *   - POST /api/relay/livekit/start-publisher → backend tworzy LiveKit
 *     room, wystawia publisher token + signed join URL, wstrzykuje link
 *     w Chatwoot conversation (jeśli `chatwootConversationId` jest znany).
 *   - Otwiera lokalny preview kamery (livekit-client SDK, dynamic import).
 *   - Pokazuje badge "Trwa konsultacja" + przycisk "Zakończ".
 *   - "Zakończ" → POST /api/relay/livekit/end-room → backend wywołuje
 *     LiveKit deleteRoom → webhook room_finished aktualizuje status sesji.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Video, VideoOff, Copy, CheckCircle2 } from "lucide-react";

interface ConsultationVideoSectionProps {
  /** Optional — gdy formularz dotyczy istniejącego ticketu (edit mode). */
  serviceId?: string | null;
  /** Optional — Chatwoot conversation id powiązany z klientem. Gdy podany,
   *  link konsultacyjny zostanie wysłany jako wiadomość w tej rozmowie. */
  chatwootConversationId?: number | null;
}

interface StartResponse {
  roomName: string;
  publisherToken: string;
  livekitUrl: string;
  joinUrl: string;
  joinToken: string;
  chatwootMessageSent: boolean;
  expiresAt: string;
  error?: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | {
      kind: "active";
      roomName: string;
      joinUrl: string;
      chatwootMessageSent: boolean;
      startedAtMs: number;
    }
  | {
      kind: "ended";
      roomName: string;
      durationSec: number;
    };

export function ConsultationVideoSection({
  serviceId,
  chatwootConversationId,
}: ConsultationVideoSectionProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // LiveKit Room instance — kept in ref so cleanup runs on unmount.
  const roomRef = useRef<unknown | null>(null);
  // Local tracks to release on close.
  const tracksCleanupRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), 6_000);
    return () => window.clearTimeout(id);
  }, [error]);

  const cleanupRoom = useCallback(async () => {
    for (const fn of tracksCleanupRef.current) {
      try {
        fn();
      } catch {
        // best-effort
      }
    }
    tracksCleanupRef.current = [];
    if (roomRef.current) {
      const room = roomRef.current as { disconnect?: () => Promise<void> };
      try {
        await room.disconnect?.();
      } catch {
        // ignore
      }
      roomRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      void cleanupRoom();
    };
  }, [cleanupRoom]);

  const startConsultation = useCallback(async () => {
    if (phase.kind === "starting" || phase.kind === "active") return;
    setError(null);
    setPhase({ kind: "starting" });

    try {
      const r = await fetch(`/api/relay/livekit/start-publisher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: serviceId ?? undefined,
          chatwootConversationId:
            typeof chatwootConversationId === "number"
              ? chatwootConversationId
              : undefined,
        }),
      });
      const body = (await r.json()) as StartResponse;
      if (!r.ok) {
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }

      // Dynamic import — livekit-client jest ~100KB, ładujemy tylko gdy
      // sprzedawca faktycznie odpala konsultację.
      const lk = await import("livekit-client");
      const room = new lk.Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;
      await room.connect(body.livekitUrl, body.publisherToken);

      // Włącz kamerę + mikrofon — użytkownik zobaczy prompt na zezwolenie.
      const localTracks = await lk.createLocalTracks({
        audio: true,
        video: { resolution: lk.VideoPresets.h540.resolution },
      });

      for (const t of localTracks) {
        await room.localParticipant.publishTrack(t);
        tracksCleanupRef.current.push(() => {
          try {
            t.stop();
          } catch {
            // ignore
          }
        });
        // Lokalny preview — attach video track do <video> elementu.
        if (t.kind === lk.Track.Kind.Video && videoRef.current) {
          t.attach(videoRef.current);
          tracksCleanupRef.current.push(() => {
            try {
              t.detach(videoRef.current as HTMLMediaElement);
            } catch {
              // ignore
            }
          });
        }
      }

      setPhase({
        kind: "active",
        roomName: body.roomName,
        joinUrl: body.joinUrl,
        chatwootMessageSent: body.chatwootMessageSent,
        startedAtMs: Date.now(),
      });
    } catch (err) {
      await cleanupRoom();
      setError(
        err instanceof Error
          ? err.message
          : "Nie udało się rozpocząć konsultacji.",
      );
      setPhase({ kind: "idle" });
    }
  }, [phase.kind, serviceId, chatwootConversationId, cleanupRoom]);

  const endConsultation = useCallback(async () => {
    if (phase.kind !== "active") return;
    const startedAtMs = phase.startedAtMs;
    const roomName = phase.roomName;
    try {
      await fetch(`/api/relay/livekit/end-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName }),
      });
    } catch {
      // ignore — webhook will eventually fire room_finished from the
      // 30-min idle timeout if the explicit delete fails.
    }
    await cleanupRoom();
    const durationSec = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
    setPhase({ kind: "ended", roomName, durationSec });
  }, [phase, cleanupRoom]);

  const copyJoinUrl = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Nie udało się skopiować linka.");
    }
  }, []);

  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Video
              className="w-5 h-5"
              style={{ color: "var(--accent)" }}
              aria-hidden="true"
            />
            Konsultacja video z agentem
          </h3>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--text-muted)" }}
          >
            Włącz kamerę i mikrofon laptopa. Link automatycznie pojawi się
            w rozmowie z agentem Chatwoot — klik i dołącza jako uczestnik.
          </p>
        </div>
      </div>

      {phase.kind === "idle" && (
        <button
          type="button"
          onClick={() => void startConsultation()}
          className="px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <Video className="w-4 h-4" aria-hidden="true" />
          Rozpocznij konsultację
        </button>
      )}

      {phase.kind === "starting" && (
        <div
          className="text-sm inline-flex items-center gap-2"
          style={{ color: "var(--text-muted)" }}
        >
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Łączenie z LiveKit…
        </div>
      )}

      {phase.kind === "active" && (
        <div className="space-y-3">
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: "#000", aspectRatio: "16 / 9" }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
              style={{
                background: "rgba(16, 185, 129, 0.15)",
                color: "var(--success, #10b981)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--success, #10b981)" }}
                aria-hidden="true"
              />
              Trwa konsultacja
            </span>
            <button
              type="button"
              onClick={() => void endConsultation()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                color: "#ef4444",
              }}
            >
              <VideoOff className="w-3.5 h-3.5" aria-hidden="true" />
              Zakończ
            </button>
          </div>
          {phase.chatwootMessageSent ? (
            <div
              className="text-xs flex items-center gap-1.5"
              style={{ color: "var(--success, #10b981)" }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Link wysłany do rozmowy Chatwoot
            </div>
          ) : (
            <div className="space-y-1.5">
              <p
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                Brak rozmowy Chatwoot dla tego zlecenia. Skopiuj link
                ręcznie i wklej w czacie:
              </p>
              <div
                className="flex items-center gap-1.5 text-xs p-2 rounded-lg"
                style={{
                  background: "rgba(0,0,0,0.05)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <input
                  readOnly
                  value={phase.joinUrl}
                  className="flex-1 bg-transparent outline-none truncate"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={() => void copyJoinUrl(phase.joinUrl)}
                  className="p-1 rounded inline-flex items-center gap-1"
                  aria-label="Kopiuj link"
                >
                  {copied ? (
                    <CheckCircle2
                      className="w-3.5 h-3.5"
                      style={{ color: "var(--success, #10b981)" }}
                      aria-hidden="true"
                    />
                  ) : (
                    <Copy
                      className="w-3.5 h-3.5"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {phase.kind === "ended" && (
        <div
          className="text-sm inline-flex items-center gap-2"
          style={{ color: "var(--text-muted)" }}
        >
          <CheckCircle2
            className="w-4 h-4"
            style={{ color: "var(--success, #10b981)" }}
            aria-hidden="true"
          />
          Konsultacja zakończona — czas{" "}
          {Math.floor(phase.durationSec / 60)} min{" "}
          {phase.durationSec % 60}s
        </div>
      )}

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="mt-3 text-xs px-2.5 py-1.5 rounded-lg"
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
  );
}
