"use client";

/**
 * Wave 23 — ConsultationViewer
 *
 * Public client component. Pobiera signed JWT z URL'a, pyta backend o
 * subscriber LiveKit token, łączy się przez livekit-client SDK i pokazuje
 * stream sprzedawcy (kamera laptopa). Audio default ON (rozmowa robocza),
 * z możliwością mute.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, PhoneOff, Video } from "lucide-react";

interface ConsultationViewerProps {
  roomName: string;
  token: string;
}

interface JoinResponse {
  livekitUrl: string;
  accessToken: string;
  roomName: string;
  identity: string;
  error?: string;
}

type Phase =
  | { kind: "loading" }
  | { kind: "connecting"; livekitUrl: string; accessToken: string; identity: string }
  | { kind: "active"; identity: string }
  | { kind: "ended" }
  | { kind: "error"; message: string };

export function ConsultationViewer({ roomName, token }: ConsultationViewerProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [audioMuted, setAudioMuted] = useState(false);
  const [publisherIdentity, setPublisherIdentity] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const roomRef = useRef<unknown | null>(null);

  // Step 1: validate token + fetch LiveKit access token.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setPhase({ kind: "error", message: "Brak tokenu w URL'u." });
      return;
    }
    void (async () => {
      try {
        const r = await fetch(
          `/api/livekit/join-token?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        const body = (await r.json()) as JoinResponse;
        if (!r.ok) {
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        if (cancelled) return;
        setPhase({
          kind: "connecting",
          livekitUrl: body.livekitUrl,
          accessToken: body.accessToken,
          identity: body.identity,
        });
      } catch (err) {
        if (cancelled) return;
        setPhase({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Nie udało się dołączyć do konsultacji.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Step 2: connect to LiveKit Room (subscriber-only).
  useEffect(() => {
    if (phase.kind !== "connecting") return;
    let cancelled = false;
    let cleanup = () => {};
    void (async () => {
      try {
        const lk = await import("livekit-client");
        const room = new lk.Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        room.on(lk.RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (cancelled) return;
          setPublisherIdentity(participant.identity);
          if (track.kind === lk.Track.Kind.Video && videoRef.current) {
            track.attach(videoRef.current);
          }
          if (track.kind === lk.Track.Kind.Audio && audioRef.current) {
            track.attach(audioRef.current);
          }
        });
        room.on(lk.RoomEvent.Disconnected, () => {
          if (cancelled) return;
          setPhase({ kind: "ended" });
        });

        await room.connect(phase.livekitUrl, phase.accessToken);
        if (cancelled) return;
        setPhase({ kind: "active", identity: phase.identity });

        cleanup = () => {
          try {
            void room.disconnect();
          } catch {
            // ignore
          }
        };
      } catch (err) {
        if (cancelled) return;
        setPhase({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Nie udało się połączyć z LiveKit.",
        });
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [phase]);

  const toggleAudio = useCallback(() => {
    if (audioRef.current) {
      const next = !audioMuted;
      audioRef.current.muted = next;
      setAudioMuted(next);
    }
  }, [audioMuted]);

  const leave = useCallback(() => {
    if (roomRef.current) {
      const room = roomRef.current as { disconnect?: () => Promise<void> };
      try {
        void room.disconnect?.();
      } catch {
        // ignore
      }
    }
    setPhase({ kind: "ended" });
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-4">
      <div className="w-full max-w-4xl">
        <header className="mb-4 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Video className="w-5 h-5 text-rose-400" aria-hidden="true" />
              <h1 className="text-base font-semibold">
                Konsultacja serwisowa
              </h1>
            </div>
            <p className="text-xs text-white/60 mt-0.5 truncate max-w-md">
              {roomName}
            </p>
            {publisherIdentity && (
              <p className="text-xs text-white/80 mt-0.5">
                Sprzedawca: {publisherIdentity}
              </p>
            )}
          </div>
          {phase.kind === "active" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleAudio}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
                aria-label={audioMuted ? "Włącz dźwięk" : "Wycisz"}
              >
                {audioMuted ? (
                  <MicOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Mic className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={leave}
                className="px-3 py-1.5 rounded-lg bg-rose-500/90 hover:bg-rose-500 inline-flex items-center gap-1.5 text-xs font-medium"
              >
                <PhoneOff className="w-3.5 h-3.5" aria-hidden="true" />
                Zakończ
              </button>
            </div>
          )}
        </header>

        <div
          className="rounded-xl overflow-hidden bg-zinc-900"
          style={{ aspectRatio: "16 / 9" }}
        >
          {phase.kind === "loading" || phase.kind === "connecting" ? (
            <div className="w-full h-full flex items-center justify-center text-white/60 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden="true" />
              {phase.kind === "loading"
                ? "Weryfikacja linka…"
                : "Łączenie z konsultacją…"}
            </div>
          ) : phase.kind === "error" ? (
            <div className="w-full h-full flex items-center justify-center text-rose-300 text-sm p-6 text-center">
              {phase.message}
            </div>
          ) : phase.kind === "ended" ? (
            <div className="w-full h-full flex items-center justify-center text-white/70 text-sm">
              Konsultacja zakończona. Możesz zamknąć tę kartę.
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
          )}
        </div>

        <audio ref={audioRef} autoPlay className="hidden" />

        <footer className="mt-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-white/40">
            myperformance.pl · konsultacja video
          </p>
        </footer>
      </div>
    </main>
  );
}
