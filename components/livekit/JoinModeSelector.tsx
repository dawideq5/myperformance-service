"use client";

/**
 * Wave 23 (overlay) — JoinModeSelector
 *
 * Reusable client component dla agentów (Chatwoot Dashboard App + admin
 * /admin/livekit). Pokazuje dwa tryby dołączenia do aktywnego LiveKit
 * roomu:
 *
 *   1. "Dołącz tutaj" — embedded subscriber view (LiveKit client SDK,
 *      lazy-loaded). Klient wymienia signed `joinToken` na LiveKit
 *      access token przez GET /api/livekit/join-token.
 *
 *   2. "Skanuj QR" — fallback dla agenta z telefonem. QR koduje pełen
 *      `https://myperformance.pl/konsultacja/<room>?token=<joinToken>`,
 *      agent skanuje swoim telefonem i dołącza w mobilnej przeglądarce.
 *
 * Props:
 *   - `roomName` — nazwa LiveKit roomu
 *   - `signedJoinToken` — HS256 token (audience `mp-consultation-join`)
 *   - `appBaseUrl` — bazowy URL myperformance.pl (do budowy QR linku)
 *   - `compact?` — true → mniejszy layout (np. w Chatwoot iframe)
 *
 * Brak prop `livekitUrl` — pobierane razem z access tokenem przez
 * `/api/livekit/join-token` żeby URL serwera nie był eksponowany w
 * server-rendered HTML (DRY: jeden endpoint zna konfigurację).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  QrCode,
  Video,
} from "lucide-react";

interface JoinModeSelectorProps {
  roomName: string;
  signedJoinToken: string;
  appBaseUrl?: string;
  compact?: boolean;
  /**
   * Wave 24 — `publisher` daje canPublish=true (2-way video chat między
   * sprzedawcą a agentem). Default `subscriber` zachowuje istniejący
   * /konsultacja/[room] flow gdzie tylko mobile (po skanowaniu QR)
   * publishuje.
   */
  publisherMode?: "publisher" | "subscriber";
}

type Mode = "browser" | "qr";

interface JoinResponse {
  livekitUrl: string;
  accessToken: string;
  roomName: string;
  identity: string;
  error?: string;
}

export function JoinModeSelector({
  roomName,
  signedJoinToken,
  appBaseUrl,
  compact = false,
  publisherMode = "subscriber",
}: JoinModeSelectorProps) {
  const [mode, setMode] = useState<Mode>("browser");

  return (
    <div
      className="rounded-xl"
      style={{
        background: "var(--surface, #fff)",
        border: "1px solid var(--border-subtle, rgba(0,0,0,0.1))",
        padding: compact ? 8 : 12,
      }}
    >
      <div
        role="tablist"
        aria-label="Tryb dołączenia"
        className="flex items-center gap-1 mb-3"
      >
        <ModeTab
          active={mode === "browser"}
          onClick={() => setMode("browser")}
          icon={<Video className="w-3.5 h-3.5" aria-hidden="true" />}
          label={publisherMode === "publisher" ? "Połącz przy użyciu tego urządzenia" : "Dołącz tutaj"}
        />
        <ModeTab
          active={mode === "qr"}
          onClick={() => setMode("qr")}
          icon={<QrCode className="w-3.5 h-3.5" aria-hidden="true" />}
          label="Pokaż kod QR"
        />
      </div>

      {mode === "browser" ? (
        <SubscriberView
          roomName={roomName}
          signedJoinToken={signedJoinToken}
          compact={compact}
          publisherMode={publisherMode}
        />
      ) : (
        <QrScanView
          roomName={roomName}
          signedJoinToken={signedJoinToken}
          appBaseUrl={appBaseUrl}
          publisherMode={publisherMode}
        />
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
      style={{
        background: active
          ? "var(--accent, #4f46e5)"
          : "var(--surface-elevated, rgba(0,0,0,0.05))",
        color: active ? "#fff" : "var(--text, #111)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Embedded subscriber view — LiveKit client SDK, lazy-loaded żeby nie
 * powiększać bundle dla agentów którzy wybiorą QR mode.
 */
function SubscriberView({
  roomName: _roomName,
  signedJoinToken,
  compact,
  publisherMode,
}: {
  roomName: string;
  signedJoinToken: string;
  compact: boolean;
  publisherMode: "publisher" | "subscriber";
}) {
  type Phase =
    | { kind: "idle" }
    | { kind: "loading" }
    | {
        kind: "connecting";
        livekitUrl: string;
        accessToken: string;
        identity: string;
      }
    | { kind: "active"; identity: string }
    | { kind: "ended" }
    | { kind: "error"; message: string };

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [audioMuted, setAudioMuted] = useState(false);
  const [publisherIdentity, setPublisherIdentity] = useState<string | null>(
    null,
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const roomRef = useRef<unknown | null>(null);

  const join = useCallback(async () => {
    setPhase({ kind: "loading" });
    try {
      const modeParam =
        publisherMode === "publisher" ? "&mode=publisher" : "";
      const r = await fetch(
        `/api/livekit/join-token?token=${encodeURIComponent(signedJoinToken)}${modeParam}`,
        { cache: "no-store" },
      );
      const body = (await r.json()) as JoinResponse;
      if (!r.ok) {
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      setPhase({
        kind: "connecting",
        livekitUrl: body.livekitUrl,
        accessToken: body.accessToken,
        identity: body.identity,
      });
    } catch (err) {
      setPhase({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Nie udało się dołączyć.",
      });
    }
  }, [signedJoinToken, publisherMode]);

  // Connect when phase moves to "connecting".
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

        // Wave 24 — w trybie publisher publikujemy lokalną kamerę + mic.
        // Jeśli przeglądarka odmówi getUserMedia, zostawiamy room jako
        // subscriber-only zamiast wywalać cały connect.
        if (publisherMode === "publisher") {
          try {
            await room.localParticipant.enableCameraAndMicrophone();
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("camera/mic publish failed", err);
          }
        }

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
  }, [phase, publisherMode]);

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

  if (phase.kind === "idle") {
    return (
      <button
        type="button"
        onClick={() => void join()}
        className="w-full px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2"
        style={{
          background: "var(--accent, #4f46e5)",
          color: "#fff",
        }}
      >
        <Video className="w-4 h-4" aria-hidden="true" />
        Dołącz do konsultacji
      </button>
    );
  }

  if (phase.kind === "ended") {
    return (
      <div
        className="text-xs text-center py-2"
        style={{ color: "var(--text-muted, #666)" }}
      >
        Konsultacja zakończona.
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="space-y-2">
        <div
          role="alert"
          className="text-xs px-2 py-1.5 rounded-lg"
          style={{
            background: "rgba(239, 68, 68, 0.12)",
            color: "#dc2626",
            border: "1px solid rgba(239, 68, 68, 0.3)",
          }}
        >
          {phase.message}
        </div>
        <button
          type="button"
          onClick={() => void join()}
          className="w-full px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{
            background: "var(--surface-elevated, rgba(0,0,0,0.05))",
            color: "var(--text, #111)",
          }}
        >
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className="rounded-lg overflow-hidden bg-black"
        style={{ aspectRatio: compact ? "4 / 3" : "16 / 9" }}
      >
        {phase.kind === "loading" || phase.kind === "connecting" ? (
          <div className="w-full h-full flex items-center justify-center text-white/70 text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            {phase.kind === "loading"
              ? "Weryfikacja…"
              : "Łączenie…"}
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

      {phase.kind === "active" && (
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[10px] truncate"
            style={{ color: "var(--text-muted, #666)" }}
          >
            {publisherIdentity ?? "Łączenie…"}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleAudio}
              className="p-1.5 rounded-lg"
              style={{ background: "var(--surface-elevated, rgba(0,0,0,0.05))" }}
              aria-label={audioMuted ? "Włącz dźwięk" : "Wycisz"}
            >
              {audioMuted ? (
                <MicOff className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Mic className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={leave}
              className="px-2 py-1.5 rounded-lg text-[11px] font-medium inline-flex items-center gap-1"
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                color: "#dc2626",
              }}
            >
              <PhoneOff className="w-3 h-3" aria-hidden="true" />
              Zakończ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * QR code render: link `https://<base>/konsultacja/<room>?token=<joinToken>`.
 * Generujemy QR client-side przez dynamic import `qrcode` (browser build).
 */
function QrScanView({
  roomName,
  signedJoinToken,
  appBaseUrl,
  publisherMode,
}: {
  roomName: string;
  signedJoinToken: string;
  appBaseUrl?: string;
  publisherMode: "publisher" | "subscriber";
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // QR koduje URL do /konsultacja/[room] z `?mode=publisher` żeby telefon
  // skanujący stał się 2-way uczestnikiem (kamera tył + mic), a nie tylko
  // viewerem. Default zachowuje starą semantykę dla legacy linków.
  const modeParam = publisherMode === "publisher" ? "&mode=publisher" : "";
  const fullUrl =
    `${(appBaseUrl ?? "https://myperformance.pl").replace(/\/$/, "")}/konsultacja/` +
    `${encodeURIComponent(roomName)}?token=${encodeURIComponent(signedJoinToken)}${modeParam}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const QR = (await import("qrcode")).default;
        const url = await QR.toDataURL(fullUrl, {
          width: 220,
          margin: 2,
          errorCorrectionLevel: "M",
        });
        if (!cancelled) setDataUrl(url);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "QR generation failed",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fullUrl]);

  return (
    <div className="space-y-2 text-center">
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt="QR code do dołączenia do konsultacji video"
          width={220}
          height={220}
          className="mx-auto rounded-lg"
          style={{ background: "#fff", padding: 8 }}
        />
      ) : error ? (
        <div
          role="alert"
          className="text-xs px-2 py-1.5 rounded-lg"
          style={{
            background: "rgba(239, 68, 68, 0.12)",
            color: "#dc2626",
            border: "1px solid rgba(239, 68, 68, 0.3)",
          }}
        >
          {error}
        </div>
      ) : (
        <div
          className="mx-auto rounded-lg flex items-center justify-center"
          style={{
            width: 220,
            height: 220,
            background: "var(--surface-elevated, rgba(0,0,0,0.05))",
          }}
        >
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        </div>
      )}
      <p
        className="text-[11px]"
        style={{ color: "var(--text-muted, #666)" }}
      >
        Zeskanuj telefonem aby dołączyć do konsultacji.
      </p>
      <a
        href={fullUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] inline-flex items-center gap-1"
        style={{ color: "var(--accent, #4f46e5)" }}
      >
        <ExternalLink className="w-3 h-3" aria-hidden="true" />
        Otwórz link bezpośrednio
      </a>
    </div>
  );
}
