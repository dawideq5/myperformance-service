"use client";

/**
 * Wave 24 — VideoConsultationDialog
 *
 * Modal otwierany z poziomu nagłówka AddServiceForm (przycisk "Rozmowa
 * wideo z serwisantem" obok submita). Wymaga aktywnej Chatwoot
 * conversation (`useChatwootConversation` zwraca `conversationId`).
 *
 * Flow:
 *   1. POST /api/relay/livekit/start-publisher z conversationId (i serviceId
 *      gdy istnieje). Backend tworzy LiveKit room, zwraca:
 *        - mobilePublisherUrl + qrCodeDataUrl (QR do skanu telefonem),
 *        - joinToken + joinUrl (link do `/konsultacja/<room>` — backup),
 *        - chatwootMessageSent (czy private note został wysłany do conv).
 *   2. Dwie zakładki:
 *        a) "Połącz przy użyciu tego urządzenia" — embedded LiveKit publisher
 *           view (kamera laptopa, mic, 2-way). Reuses join-token endpoint
 *           z `?mode=publisher` żeby canPublish=true.
 *        b) "Pokaż kod QR" — pre-rendered qrCodeDataUrl z serwera +
 *           link do mobilePublisherUrl (telefon staje się publisherem).
 *   3. Status pollingu room-status (waiting/active/ended) co 5 s.
 *   4. "Zakończ rozmowę" → POST /api/relay/livekit/end-room.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  QrCode,
  Radio,
  Video,
  X,
} from "lucide-react";

interface VideoConsultationDialogProps {
  open: boolean;
  onClose: () => void;
  conversationId: number | null;
  serviceId?: string | null;
}

interface StartResponse {
  roomName: string;
  mobilePublisherUrl: string;
  qrCodeDataUrl: string;
  livekitUrl: string;
  joinUrl: string;
  joinToken: string;
  chatwootMessageSent: boolean;
  expiresAt: string;
  /** Wave 24 — gdy 429 z powodu istniejącej sesji, backend dodaje
   *  `activeRoomName` żeby UI mogło ją auto-zamknąć i retry'ować. */
  activeRoomName?: string;
  error?: string;
}

interface RoomStatusResponse {
  status: "waiting" | "active" | "ended" | "unknown";
  publisherConnected: boolean;
  participantCount: number;
  liveKitReachable: boolean;
  error?: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | {
      kind: "active";
      roomName: string;
      mobilePublisherUrl: string;
      qrCodeDataUrl: string;
      joinToken: string;
      joinUrl: string;
      chatwootMessageSent: boolean;
      liveStatus: "waiting" | "active" | "ended" | "unknown";
      participantCount: number;
    }
  | { kind: "ended" };

const STATUS_POLL_MS = 5_000;
type Tab = "device" | "qr";

export function VideoConsultationDialog({
  open,
  onClose,
  conversationId,
  serviceId,
}: VideoConsultationDialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("device");
  // React StrictMode + szybkie otwarcia modal wielokrotnie odpalają
  // ten effect zanim setPhase z poprzedniego cyklu się propaguje. Bez
  // tego ref'u rate-limit (6/min) trafia user który tylko raz kliknął.
  const startInFlightRef = useRef(false);

  // Reset gdy modal się zamknie — kolejne otwarcie odpali nowy start.
  useEffect(() => {
    if (!open) startInFlightRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (phase.kind !== "idle") return;
    if (conversationId == null) return;
    if (startInFlightRef.current) return;
    startInFlightRef.current = true;

    let cancelled = false;
    setPhase({ kind: "starting" });
    setError(null);

    void (async () => {
      const tryStart = async (): Promise<StartResponse> => {
        const r = await fetch(`/api/relay/livekit/start-publisher`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatwootConversationId: conversationId,
            serviceId: serviceId ?? undefined,
          }),
        });
        const data = (await r.json()) as StartResponse;
        if (!r.ok) {
          // 429 z `activeRoomName` = stale sesja sprzedawcy. Auto-end +
          // retry: wystarcza, bo `listActiveSessionsByUser` po stronie
          // backend filtruje >30min, a fresh stale (np. <30min)
          // zamykamy explicite.
          if (r.status === 429 && data.activeRoomName) {
            try {
              await fetch(`/api/relay/livekit/end-room`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomName: data.activeRoomName }),
              });
            } catch {
              // continue — backoff handled w retry catch
            }
            const r2 = await fetch(`/api/relay/livekit/start-publisher`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chatwootConversationId: conversationId,
                serviceId: serviceId ?? undefined,
              }),
            });
            const data2 = (await r2.json()) as StartResponse;
            if (!r2.ok) {
              throw new Error(data2.error ?? `HTTP ${r2.status}`);
            }
            return data2;
          }
          throw new Error(data.error ?? `HTTP ${r.status}`);
        }
        return data;
      };
      try {
        const body = await tryStart();
        if (cancelled) return;
        setPhase({
          kind: "active",
          roomName: body.roomName,
          mobilePublisherUrl: body.mobilePublisherUrl,
          qrCodeDataUrl: body.qrCodeDataUrl,
          joinToken: body.joinToken,
          joinUrl: body.joinUrl,
          chatwootMessageSent: body.chatwootMessageSent,
          liveStatus: "waiting",
          participantCount: 0,
        });
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Nie udało się rozpocząć rozmowy.",
        );
        setPhase({ kind: "idle" });
        // Pozwól użytkownikowi spróbować ponownie z nowego klika —
        // bez resetu ref'a kolejne otwarcia tego samego modala
        // pomijają fetch.
        startInFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, conversationId, serviceId, phase.kind]);

  // Status polling.
  useEffect(() => {
    if (phase.kind !== "active") return;
    const { roomName, joinToken } = phase;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(
          `/api/relay/livekit/room-status?room=${encodeURIComponent(roomName)}&token=${encodeURIComponent(joinToken)}`,
          { cache: "no-store" },
        );
        const body = (await r.json()) as RoomStatusResponse;
        if (!r.ok) return;
        if (cancelled) return;
        setPhase((prev) =>
          prev.kind === "active" && prev.roomName === roomName
            ? {
                ...prev,
                liveStatus: body.status,
                participantCount: body.participantCount,
              }
            : prev,
        );
      } catch {
        // ignore
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), STATUS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [phase]);

  const endRoom = useCallback(async () => {
    if (phase.kind !== "active") return;
    const roomName = phase.roomName;
    try {
      await fetch(`/api/relay/livekit/end-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName }),
      });
    } catch {
      // ignore — empty timeout w LiveKit dorzuci room_finished
    }
    setPhase({ kind: "ended" });
  }, [phase]);

  const handleClose = useCallback(() => {
    if (phase.kind === "active") {
      void endRoom();
    }
    setPhase({ kind: "idle" });
    setError(null);
    onClose();
  }, [phase, endRoom, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-consultation-title"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{
          background: "var(--bg-card, #fff)",
          border: "1px solid var(--border-subtle, rgba(0,0,0,0.1))",
        }}
      >
        <header
          className="sticky top-0 px-5 py-3 flex items-center justify-between gap-3 border-b"
          style={{
            background: "var(--bg-header, #fff)",
            borderColor: "var(--border-subtle, rgba(0,0,0,0.1))",
          }}
        >
          <h2
            id="video-consultation-title"
            className="text-base font-semibold flex items-center gap-2"
          >
            <Video
              className="w-5 h-5"
              style={{ color: "var(--accent, #4f46e5)" }}
              aria-hidden="true"
            />
            Rozmowa wideo z serwisantem
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Zamknij"
            className="p-1.5 rounded-lg hover:bg-black/5"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          {phase.kind === "starting" && (
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Tworzenie rozmowy w LiveKit…
            </div>
          )}

          {phase.kind === "active" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge
                  status={phase.liveStatus}
                  participants={phase.participantCount}
                />
                {phase.chatwootMessageSent && (
                  <span
                    className="inline-flex items-center gap-1.5 text-xs"
                    style={{ color: "var(--success, #10b981)" }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Link wysłany do agenta w Chatwoot
                  </span>
                )}
              </div>

              <div role="tablist" className="flex items-center gap-1">
                <TabButton
                  active={tab === "device"}
                  onClick={() => setTab("device")}
                  icon={<Video className="w-3.5 h-3.5" aria-hidden="true" />}
                  label="Połącz przy użyciu tego urządzenia"
                />
                <TabButton
                  active={tab === "qr"}
                  onClick={() => setTab("qr")}
                  icon={<QrCode className="w-3.5 h-3.5" aria-hidden="true" />}
                  label="Pokaż kod QR"
                />
              </div>

              {tab === "device" ? (
                <DevicePublisherView
                  signedJoinToken={phase.joinToken}
                />
              ) : (
                <QrView
                  qrCodeDataUrl={phase.qrCodeDataUrl}
                  mobilePublisherUrl={phase.mobilePublisherUrl}
                />
              )}

              <div className="flex items-center justify-end pt-2">
                <button
                  type="button"
                  onClick={() => void endRoom()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
                  style={{
                    background: "rgba(239, 68, 68, 0.15)",
                    color: "#dc2626",
                  }}
                >
                  <PhoneOff className="w-3.5 h-3.5" aria-hidden="true" />
                  Zakończ rozmowę
                </button>
              </div>
            </div>
          )}

          {phase.kind === "ended" && (
            <div
              className="text-sm flex items-center gap-2"
              style={{ color: "var(--text-muted)" }}
            >
              <CheckCircle2
                className="w-4 h-4"
                style={{ color: "var(--success, #10b981)" }}
                aria-hidden="true"
              />
              Rozmowa zakończona.
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="text-xs px-2.5 py-1.5 rounded-lg"
              style={{
                background: "rgba(239, 68, 68, 0.12)",
                color: "#dc2626",
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
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
          : "rgba(0,0,0,0.05)",
        color: active ? "#fff" : "var(--text-main, #111)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

interface JoinResponse {
  livekitUrl: string;
  accessToken: string;
  identity: string;
  error?: string;
}

type DevicePhase =
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

function DevicePublisherView({
  signedJoinToken,
}: {
  signedJoinToken: string;
}) {
  const [phase, setPhase] = useState<DevicePhase>({ kind: "idle" });
  const [audioMuted, setAudioMuted] = useState(false);
  const [remoteIdentity, setRemoteIdentity] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const roomRef = useRef<unknown | null>(null);

  const join = useCallback(async () => {
    setPhase({ kind: "loading" });
    try {
      const r = await fetch(
        `/api/relay/livekit/join-token?token=${encodeURIComponent(signedJoinToken)}&mode=publisher`,
        { cache: "no-store" },
      );
      const body = (await r.json()) as JoinResponse;
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      setPhase({
        kind: "connecting",
        livekitUrl: body.livekitUrl,
        accessToken: body.accessToken,
        identity: body.identity,
      });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Nie udało się dołączyć.",
      });
    }
  }, [signedJoinToken]);

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
          setRemoteIdentity(participant.identity);
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

        try {
          await room.localParticipant.enableCameraAndMicrophone();
          // Pokaż lokalny preview.
          const localVideoPub = Array.from(
            room.localParticipant.videoTrackPublications.values(),
          )[0];
          if (localVideoPub?.track && localVideoRef.current) {
            localVideoPub.track.attach(localVideoRef.current);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("camera/mic publish failed", err);
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
            err instanceof Error ? err.message : "Nie udało się połączyć.",
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
    const room = roomRef.current as { disconnect?: () => Promise<void> } | null;
    try {
      void room?.disconnect?.();
    } catch {
      // ignore
    }
    setPhase({ kind: "ended" });
  }, []);

  if (phase.kind === "idle") {
    return (
      <button
        type="button"
        onClick={() => void join()}
        className="w-full px-3 py-2.5 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2"
        style={{ background: "var(--accent, #4f46e5)", color: "#fff" }}
      >
        <Video className="w-4 h-4" aria-hidden="true" />
        Dołącz teraz z tego urządzenia (kamera + mikrofon)
      </button>
    );
  }

  if (phase.kind === "ended") {
    return (
      <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
        Połączenie zakończone.
      </p>
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
          style={{ background: "rgba(0,0,0,0.05)" }}
        >
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div
          className="rounded-lg overflow-hidden bg-black"
          style={{ aspectRatio: "4 / 3" }}
        >
          {phase.kind === "loading" || phase.kind === "connecting" ? (
            <div className="w-full h-full flex items-center justify-center text-white/70 text-xs gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              {phase.kind === "loading" ? "Weryfikacja…" : "Łączenie…"}
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
              aria-label="Obraz z kamery serwisanta"
            />
          )}
        </div>
        <div
          className="rounded-lg overflow-hidden bg-black"
          style={{ aspectRatio: "4 / 3" }}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
            aria-label="Lokalny podgląd kamery"
          />
        </div>
      </div>
      <audio ref={audioRef} autoPlay className="hidden" />
      {phase.kind === "active" && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {remoteIdentity ?? "Czekam na agenta…"}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleAudio}
              className="p-1.5 rounded-lg"
              style={{ background: "rgba(0,0,0,0.05)" }}
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
              Rozłącz lokalnie
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QrView({
  qrCodeDataUrl,
  mobilePublisherUrl,
}: {
  qrCodeDataUrl: string;
  mobilePublisherUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mobilePublisherUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [mobilePublisherUrl]);
  return (
    <div className="space-y-2 text-center">
      <div
        className="rounded-xl p-3 inline-block"
        style={{
          background: "#fff",
          border: "1px solid var(--border-subtle, rgba(0,0,0,0.1))",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrCodeDataUrl}
          alt="Kod QR — zeskanuj telefonem aby dołączyć do rozmowy"
          width={220}
          height={220}
          className="block"
        />
      </div>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Zeskanuj telefonem aby przekazać obraz z kamery telefonu do agenta.
      </p>
      <div className="flex items-center justify-center gap-2 text-[11px]">
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg"
          style={{ background: "rgba(0,0,0,0.05)" }}
        >
          {copied ? (
            <CheckCircle2
              className="w-3 h-3"
              style={{ color: "var(--success, #10b981)" }}
              aria-hidden="true"
            />
          ) : (
            <Copy className="w-3 h-3" aria-hidden="true" />
          )}
          {copied ? "Skopiowano" : "Kopiuj link"}
        </button>
        <a
          href={mobilePublisherUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg"
          style={{ background: "rgba(0,0,0,0.05)" }}
        >
          <ExternalLink className="w-3 h-3" aria-hidden="true" />
          Otwórz link
        </a>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  participants,
}: {
  status: "waiting" | "active" | "ended" | "unknown";
  participants: number;
}) {
  if (status === "active") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
        style={{
          background: "rgba(16, 185, 129, 0.15)",
          color: "var(--success, #10b981)",
        }}
      >
        <Radio className="w-3 h-3 animate-pulse" aria-hidden="true" />
        Trwa — {participants} {participants === 1 ? "uczestnik" : "uczestników"}
      </span>
    );
  }
  if (status === "ended") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
        style={{
          background: "rgba(0, 0, 0, 0.08)",
          color: "var(--text-muted)",
        }}
      >
        Zakończono
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
      style={{
        background: "rgba(245, 158, 11, 0.15)",
        color: "var(--warning, #f59e0b)",
      }}
    >
      <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
      Oczekuje na agenta
    </span>
  );
}
