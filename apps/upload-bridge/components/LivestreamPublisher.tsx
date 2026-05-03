"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CameraOff,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type LocalVideoTrack,
} from "livekit-client";

/**
 * Publisher PWA dla self-hosted LiveKit (Wave 22 / F16c).
 *
 * Flow:
 *   1. Sprzedawca skanuje QR z panelu serwisanta → trafia tutaj z `room` +
 *      `token` w URL.
 *   2. Komponent woła `getUserMedia` żeby JEDNOZNACZNIE dostać prompt
 *      przeglądarki (bez tego `setCameraEnabled` może milczeć w iOS Safari).
 *   3. `Room.connect(LIVEKIT_URL, token)` — server URL z env
 *      `NEXT_PUBLIC_LIVEKIT_URL` (inlinowany przy buildzie). Bez env →
 *      explicit error UI zamiast ślepej próby.
 *   4. Publishujemy kamerę + mikrofon (publisher token = canPublish=true,
 *      canSubscribe=false — z F16b).
 *   5. Lokalny preview: `videoTrack.attach(<video>)` + `playsInline` żeby
 *      iOS nie wszedł w fullscreen i nie wstrzymał autoplay.
 *   6. Cleanup na unmount: `room.disconnect()` (AND guard `disconnected`
 *      flag żeby StrictMode double-mount nie zostawiał osieroconych
 *      połączeń — i tak `reactStrictMode: false` w `next.config.js`,
 *      ale defensywnie).
 *
 * UI: full-screen mobile, video `object-cover`, control bar fixed bottom
 * z 3 dużymi touch-targetami (≥56px). Polish copy.
 */

type UiState =
  | "idle"
  | "permission_pending"
  | "permission_denied"
  | "no_camera"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

interface LivestreamPublisherProps {
  room: string;
  token: string;
}

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";

export function LivestreamPublisher({
  room: roomName,
  token,
}: LivestreamPublisherProps) {
  const [uiState, setUiState] = useState<UiState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">(
    "environment",
  );
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [switching, setSwitching] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const attachedTrackRef = useRef<LocalVideoTrack | null>(null);
  const startedRef = useRef<boolean>(false);
  const disconnectedRef = useRef<boolean>(false);

  /**
   * Re-attach lokalnego preview video tracka do <video>. Wywoływana po
   * pierwszej publikacji oraz po przełączeniu kamery (front/back) — track
   * się zmienia, element nie. Stary track odpinamy żeby nie zostawiać
   * przyczepionych srcObject.
   */
  const attachLocalCameraPreview = useCallback((room: Room) => {
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.videoTrack as LocalVideoTrack | undefined;
    if (!track || !videoRef.current) return;
    if (attachedTrackRef.current && attachedTrackRef.current !== track) {
      try {
        attachedTrackRef.current.detach(videoRef.current);
      } catch {
        /* ignore */
      }
    }
    track.attach(videoRef.current);
    attachedTrackRef.current = track;
    // iOS Safari: autoplay polityka wymaga muted + playsInline.
    videoRef.current.muted = true;
    videoRef.current.playsInline = true;
  }, []);

  const cleanupRoom = useCallback(async () => {
    disconnectedRef.current = true;
    const room = roomRef.current;
    roomRef.current = null;
    if (attachedTrackRef.current && videoRef.current) {
      try {
        attachedTrackRef.current.detach(videoRef.current);
      } catch {
        /* ignore */
      }
      attachedTrackRef.current = null;
    }
    if (room) {
      try {
        await room.disconnect();
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Główny connect-on-mount effect.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!LIVEKIT_URL) {
      setUiState("error");
      setErrorMsg(
        "Brak konfiguracji serwera LiveKit (NEXT_PUBLIC_LIVEKIT_URL). Skontaktuj się z administratorem.",
      );
      return;
    }

    let cancelled = false;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      // Mobile preferuje VP8 — szerszy support i niższy zużycie CPU.
      videoCaptureDefaults: {
        facingMode: "environment",
        resolution: { width: 1280, height: 720, frameRate: 30 },
      },
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    roomRef.current = room;

    room
      .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (cancelled || disconnectedRef.current) return;
        if (state === ConnectionState.Connected) setUiState("connected");
        else if (state === ConnectionState.Connecting) setUiState("connecting");
        else if (state === ConnectionState.Reconnecting)
          setUiState("reconnecting");
        else if (state === ConnectionState.Disconnected)
          setUiState("disconnected");
      })
      .on(RoomEvent.Disconnected, () => {
        if (cancelled) return;
        setUiState("disconnected");
      })
      .on(RoomEvent.LocalTrackPublished, () => {
        if (cancelled) return;
        attachLocalCameraPreview(room);
      });

    void (async () => {
      try {
        setUiState("permission_pending");
        // Explicit permission probe ZANIM connect — żeby user widział prompt
        // od razu i żeby błąd permissions nie udawał błędu networku LiveKit.
        // Stream natychmiast wyłączamy; LiveKit i tak zażąda swój przy
        // setCameraEnabled.
        try {
          const probe = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: true,
          });
          probe.getTracks().forEach((t) => t.stop());
        } catch (err: unknown) {
          if (cancelled) return;
          const name =
            err && typeof err === "object" && "name" in err
              ? String((err as { name: unknown }).name)
              : "";
          if (name === "NotAllowedError" || name === "SecurityError") {
            setUiState("permission_denied");
            return;
          }
          if (
            name === "NotFoundError" ||
            name === "OverconstrainedError" ||
            name === "DevicesNotFoundError"
          ) {
            setUiState("no_camera");
            return;
          }
          setUiState("error");
          setErrorMsg(
            err instanceof Error
              ? err.message
              : "Nie udało się uzyskać dostępu do kamery.",
          );
          return;
        }

        if (cancelled) return;
        setUiState("connecting");
        await room.connect(LIVEKIT_URL, token);
        if (cancelled) return;

        await room.localParticipant.setCameraEnabled(true, {
          facingMode: "environment",
          resolution: { width: 1280, height: 720, frameRate: 30 },
        });
        await room.localParticipant.setMicrophoneEnabled(true);

        if (cancelled) return;
        attachLocalCameraPreview(room);
        setUiState("connected");
      } catch (err: unknown) {
        if (cancelled) return;
        setUiState("error");
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Nie udało się połączyć z serwerem live view.",
        );
      }
    })();

    return () => {
      cancelled = true;
      void cleanupRoom();
    };
    // intentional: connect on mount once. roomName/token z URL są stabilne
    // przez całe życie komponentu (route remount = nowy mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSwitchCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || switching) return;
    setSwitching(true);
    const next = facingMode === "environment" ? "user" : "environment";
    try {
      // Wyłącz najpierw, żeby zwolnić uchwyt do kamery (Android Chrome czasami
      // odmawia drugiej akwizycji bez release).
      await room.localParticipant.setCameraEnabled(false);
      await room.localParticipant.setCameraEnabled(true, {
        facingMode: next,
        resolution: { width: 1280, height: 720, frameRate: 30 },
      });
      setFacingMode(next);
      attachLocalCameraPreview(room);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Nie udało się przełączyć kamery.",
      );
    } finally {
      setSwitching(false);
    }
  }, [facingMode, switching, attachLocalCameraPreview]);

  const handleToggleAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !audioEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setAudioEnabled(next);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Nie udało się przełączyć mikrofonu.",
      );
    }
  }, [audioEnabled]);

  const handleEnd = useCallback(async () => {
    await cleanupRoom();
    // Hard navigation — sygnalizuje koniec sesji + omija ewentualne
    // cache'owanie stanu kompoenentu.
    if (typeof window !== "undefined") {
      window.location.href = "/done";
    }
  }, [cleanupRoom]);

  const statusLabel = useMemo(() => {
    switch (uiState) {
      case "idle":
      case "permission_pending":
        return "Proszę o dostęp do kamery i mikrofonu…";
      case "connecting":
        return "Łączenie z serwerem…";
      case "connected":
        return "Połączono — transmisja aktywna";
      case "reconnecting":
        return "Wznawianie połączenia…";
      case "disconnected":
        return "Rozłączono";
      case "error":
        return "Błąd połączenia";
      case "permission_denied":
        return "Brak zgody na kamerę / mikrofon";
      case "no_camera":
        return "Brak dostępnej kamery";
      default:
        return "";
    }
  }, [uiState]);

  // Permission denied — full-screen blocking overlay.
  if (uiState === "permission_denied") {
    return (
      <FullscreenMessage
        icon={<ShieldAlert className="h-10 w-10" aria-hidden="true" />}
        accent="var(--warning)"
        title="Potrzebujemy dostępu do kamery i mikrofonu"
        body="Zezwól w przeglądarce na używanie kamery i mikrofonu, aby serwisant mógł zobaczyć urządzenie. Następnie odśwież stronę."
        actions={[
          {
            label: "Odśwież stronę",
            icon: <RefreshCw className="h-5 w-5" aria-hidden="true" />,
            onClick: () => {
              if (typeof window !== "undefined") window.location.reload();
            },
          },
        ]}
      />
    );
  }

  if (uiState === "no_camera") {
    return (
      <FullscreenMessage
        icon={<CameraOff className="h-10 w-10" aria-hidden="true" />}
        accent="var(--error)"
        title="Brak dostępnej kamery"
        body="To urządzenie nie ma kamery lub jest używana przez inną aplikację. Zamknij inne aplikacje i spróbuj ponownie."
        actions={[
          {
            label: "Spróbuj ponownie",
            icon: <RefreshCw className="h-5 w-5" aria-hidden="true" />,
            onClick: () => {
              if (typeof window !== "undefined") window.location.reload();
            },
          },
        ]}
      />
    );
  }

  if (uiState === "error") {
    return (
      <FullscreenMessage
        icon={<AlertCircle className="h-10 w-10" aria-hidden="true" />}
        accent="var(--error)"
        title="Nie udało się uruchomić połączenia"
        body={
          errorMsg ??
          "Sprawdź połączenie z internetem i spróbuj ponownie zeskanować kod QR."
        }
        actions={[
          {
            label: "Spróbuj ponownie",
            icon: <RefreshCw className="h-5 w-5" aria-hidden="true" />,
            onClick: () => {
              if (typeof window !== "undefined") window.location.reload();
            },
          },
        ]}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: "#000", color: "var(--text-main)" }}
    >
      {/* Status overlay (top) */}
      <div
        className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-2 px-4 pt-[env(safe-area-inset-top,0px)]"
      >
        <div
          className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-md"
          style={{
            background: "rgba(15, 15, 22, 0.7)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            color: "var(--text-main)",
          }}
          aria-live="polite"
        >
          <StatusDot state={uiState} />
          {statusLabel}
        </div>
        <div
          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-mono backdrop-blur-md"
          style={{
            background: "rgba(15, 15, 22, 0.7)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            color: "var(--text-muted)",
          }}
          aria-label="Identyfikator pokoju"
        >
          {roomName.length > 18 ? `${roomName.slice(0, 16)}…` : roomName}
        </div>
      </div>

      {/* Local preview — fills viewport */}
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        autoPlay
        playsInline
        muted
        aria-label="Podgląd kamery — to widzi serwisant"
      />

      {/* Connecting / reconnecting spinner overlay */}
      {(uiState === "idle" ||
        uiState === "permission_pending" ||
        uiState === "connecting" ||
        uiState === "reconnecting") && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ background: "rgba(0, 0, 0, 0.5)" }}
        >
          <div className="flex flex-col items-center gap-3">
            <Loader2
              className="h-10 w-10 animate-spin"
              style={{ color: "var(--accent)" }}
              aria-hidden="true"
            />
            <p className="text-sm">{statusLabel}</p>
          </div>
        </div>
      )}

      {/* Disconnected overlay */}
      {uiState === "disconnected" && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ background: "rgba(0, 0, 0, 0.65)" }}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <PhoneOff className="h-10 w-10" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <p className="text-sm">Rozłączono</p>
          </div>
        </div>
      )}

      {/* Inline error banner (non-blocking) — uiState `"error"` was already
          handled by the full-screen FullscreenMessage above; here we only
          surface transient errors (np. switch camera failed) bez
          blokowania całego UI. */}
      {errorMsg && (
        <div
          role="alert"
          className="absolute left-4 right-4 top-16 z-10 flex items-start gap-2 rounded-xl px-3 py-2 text-xs backdrop-blur-md"
          style={{
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "var(--text-main)",
          }}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1">{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="rounded-full px-2 text-xs"
            style={{ color: "var(--text-muted)" }}
            aria-label="Zamknij komunikat"
          >
            ×
          </button>
        </div>
      )}

      {/* Control bar (bottom) */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-around gap-3 px-6 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-4"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))",
        }}
      >
        <ControlButton
          onClick={handleSwitchCamera}
          disabled={uiState !== "connected" || switching}
          aria-label={
            facingMode === "environment"
              ? "Przełącz na kamerę przednią"
              : "Przełącz na kamerę tylną"
          }
          variant="secondary"
        >
          {switching ? (
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw className="h-6 w-6" aria-hidden="true" />
          )}
          <span className="text-[11px] font-medium">Kamera</span>
        </ControlButton>

        <ControlButton
          onClick={handleToggleAudio}
          disabled={uiState !== "connected"}
          aria-label={audioEnabled ? "Wycisz mikrofon" : "Włącz mikrofon"}
          variant="secondary"
          active={!audioEnabled}
        >
          {audioEnabled ? (
            <Mic className="h-6 w-6" aria-hidden="true" />
          ) : (
            <MicOff className="h-6 w-6" aria-hidden="true" />
          )}
          <span className="text-[11px] font-medium">
            {audioEnabled ? "Wycisz" : "Wł. mic"}
          </span>
        </ControlButton>

        <ControlButton
          onClick={handleEnd}
          aria-label="Zakończ rozmowę"
          variant="danger"
        >
          <PhoneOff className="h-6 w-6" aria-hidden="true" />
          <span className="text-[11px] font-medium">Zakończ</span>
        </ControlButton>
      </div>
    </div>
  );
}

function StatusDot({ state }: { state: UiState }) {
  const color =
    state === "connected"
      ? "var(--success)"
      : state === "reconnecting" || state === "connecting" || state === "permission_pending" || state === "idle"
        ? "var(--warning)"
        : state === "disconnected" || state === "error" || state === "permission_denied" || state === "no_camera"
          ? "var(--error)"
          : "var(--text-muted)";
  return (
    <span
      className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
      style={{
        background: color,
        boxShadow: state === "connected" ? `0 0 8px ${color}` : undefined,
      }}
      aria-hidden="true"
    />
  );
}

interface ControlButtonProps {
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  variant: "secondary" | "danger";
  active?: boolean;
  "aria-label": string;
  children: React.ReactNode;
}

function ControlButton({
  onClick,
  disabled,
  variant,
  active,
  "aria-label": ariaLabel,
  children,
}: ControlButtonProps) {
  const danger = variant === "danger";
  const bg = danger
    ? "var(--error)"
    : active
      ? "rgba(239, 68, 68, 0.85)"
      : "rgba(255, 255, 255, 0.12)";
  return (
    <button
      type="button"
      onClick={() => {
        void onClick();
      }}
      disabled={disabled}
      aria-label={ariaLabel}
      className="flex min-h-[72px] min-w-[72px] flex-col items-center justify-center gap-1 rounded-2xl px-4 py-3 text-white transition-transform active:scale-95 disabled:opacity-50"
      style={{
        background: bg,
        backdropFilter: danger ? undefined : "blur(8px)",
        boxShadow: danger
          ? "0 8px 24px -8px rgba(239, 68, 68, 0.6)"
          : "0 4px 12px -4px rgba(0, 0, 0, 0.4)",
      }}
    >
      {children}
    </button>
  );
}

interface FullscreenMessageProps {
  icon: React.ReactNode;
  accent: string;
  title: string;
  body: string;
  actions: { label: string; icon: React.ReactNode; onClick: () => void }[];
}

function FullscreenMessage({
  icon,
  accent,
  title,
  body,
  actions,
}: FullscreenMessageProps) {
  return (
    <main
      className="fixed inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center"
      style={{ background: "var(--bg-main)", color: "var(--text-main)" }}
    >
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full"
        style={{
          background: `color-mix(in srgb, ${accent} 12%, transparent)`,
          color: accent,
        }}
      >
        {icon}
      </div>
      <div className="max-w-sm space-y-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {body}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition-transform active:scale-95"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
      <p className="absolute bottom-6 text-[11px]" style={{ color: "var(--text-muted)" }}>
        myperformance.pl · Live View
      </p>
    </main>
  );
}
