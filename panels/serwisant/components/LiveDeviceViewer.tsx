"use client";

/**
 * Wave 22 / F16d — LiveDeviceViewer
 *
 * Modal subscriber UI dla live video stream z urządzenia mobile sprzedawcy.
 * Wywoływany z `RequestLiveViewButton.tsx` po otrzymaniu odpowiedzi z
 * `POST /api/livekit/request-view` (room name + publisher URL + QR data URL).
 *
 * Lifecycle:
 *   1. Modal otwiera się w stanie "waiting" — pokazuje QR code do zeskanowania
 *      przez sprzedawcę-mobile.
 *   2. Komponent fetchuje subscriber token (`GET /api/livekit/subscriber-token`)
 *      i nawiązuje WebSocket connection do LiveKit (subscribe-only).
 *   3. Gdy publisher (mobile) dołącza — przełączamy na "active": video stream
 *      attached do `<video>`, audio do `<audio>`.
 *   4. Cleanup: na unmount LUB tab close → `room.disconnect()`.
 *
 * Detekcja publishera: `room_finished` webhook (F16e) jest out-of-scope F16d,
 * więc rozpoznajemy publishera po prefix identity (`mobile-*`) lub metadata
 * `role: "publisher"` — oba są seedowane przez F16b w `request-view`.
 *
 * Bundle: `livekit-client` (~100KB) jest dynamic-importowany w `useEffect`,
 * dzięki czemu otwarcie ServiceDetailView nie ładuje SDK póki user nie
 * kliknie "Pokaż na żywo".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Loader2,
  PhoneOff,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type {
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  Track,
} from "livekit-client";

interface LiveDeviceViewerProps {
  /** Service id — propagowany do ARIA label / heading. */
  serviceId: string;
  /** Numer ticketu — wyświetlany w headerze (UX context). */
  ticketNumber?: string | null;
  /** Room name z `request-view` (mp-service-<uuid>-<rand>). */
  roomName: string;
  /** URL deeplinka publishera (do upload-bridge `/livestream`). */
  publisherUrl: string;
  /** QR code base64 (data:image/png) — pre-rendered server-side. */
  qrCodeDataUrl: string | null;
  /** Wywołane przy zamknięciu modal (X, ESC, "Zakończ rozmowę"). */
  onClose: () => void;
}

type ConnState =
  | { phase: "loading-token" }
  | { phase: "connecting" }
  | { phase: "waiting" } // SDK connected, no publisher yet
  | { phase: "active" } // publisher live
  | { phase: "error"; message: string };

interface SubscriberTokenResponse {
  token: string;
  url: string;
  roomName: string;
  error?: string;
}

/**
 * Heuristyka rozpoznająca publishera (mobile sprzedawcy) wśród zdalnych
 * uczestników. F16b ustawia identity = `mobile-<short>` i metadata
 * `{role: "publisher"}`. Defence in depth: oba warunki są niezależne.
 */
function isPublisherParticipant(p: Participant): boolean {
  if (p.identity.startsWith("mobile-")) return true;
  if (p.metadata) {
    try {
      const md = JSON.parse(p.metadata) as { role?: unknown };
      if (md.role === "publisher") return true;
    } catch {
      // metadata not JSON — ignore
    }
  }
  return false;
}

export function LiveDeviceViewer({
  serviceId,
  ticketNumber,
  roomName,
  qrCodeDataUrl,
  publisherUrl,
  onClose,
}: LiveDeviceViewerProps) {
  const [state, setState] = useState<ConnState>({ phase: "loading-token" });
  const [audioMuted, setAudioMuted] = useState(false);

  // Refs do live elements — `room.disconnect()` na unmount + tab close.
  const roomRef = useRef<Room | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Track śledzimy żeby zrobić `track.detach()` przy odpinaniu/unmount.
  const attachedVideoRef = useRef<RemoteTrack | null>(null);
  const attachedAudioRef = useRef<RemoteTrack | null>(null);

  // ESC zamyka modal (a11y).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Główny lifecycle: dynamic-import livekit-client → fetch subscriber token →
  // connect → register handlers. Cleanup: detach tracks + disconnect.
  useEffect(() => {
    let cancelled = false;
    let createdRoom: Room | null = null;

    const setup = async () => {
      // 1. Pobierz subscriber token z dashboard (relay).
      let payload: SubscriberTokenResponse;
      try {
        const r = await fetch(
          `/api/relay/livekit/subscriber-token?room=${encodeURIComponent(roomName)}`,
          { cache: "no-store" },
        );
        const j = (await r.json()) as SubscriberTokenResponse;
        if (!r.ok) {
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        payload = j;
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: "error",
          message:
            err instanceof Error
              ? err.message
              : "Nie udało się pobrać tokenu subskrybenta.",
        });
        return;
      }

      if (cancelled) return;
      setState({ phase: "connecting" });

      // 2. Dynamic-import livekit-client (~100KB) — koszt ponoszony tylko gdy
      // user faktycznie otworzył modal.
      let RoomCtor: typeof Room;
      let RoomEvent: typeof import("livekit-client").RoomEvent;
      let TrackEnum: typeof Track;
      try {
        const mod = await import("livekit-client");
        RoomCtor = mod.Room;
        RoomEvent = mod.RoomEvent;
        TrackEnum = mod.Track;
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: "error",
          message:
            err instanceof Error
              ? `Nie udało się załadować biblioteki LiveKit: ${err.message}`
              : "Nie udało się załadować biblioteki LiveKit.",
        });
        return;
      }

      if (cancelled) return;

      const room = new RoomCtor({
        // Adaptive: silnik LiveKit downscaluje gdy connection słabe.
        adaptiveStream: true,
        // Subscribe-only — żaden publish, więc dynacast nie ma znaczenia,
        // ale włączamy żeby track downsample działał.
        dynacast: true,
      });

      // Event: nowy uczestnik dołączył. Jeśli to publisher — przełącz fazę.
      room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        if (isPublisherParticipant(p)) {
          if (!cancelled) setState({ phase: "active" });
        }
      });

      // Event: track subskrybowany. Attach do <video> / <audio>.
      room.on(
        RoomEvent.TrackSubscribed,
        (
          track: RemoteTrack,
          _pub: RemoteTrackPublication,
          participant: RemoteParticipant,
        ) => {
          if (!isPublisherParticipant(participant)) return;
          if (track.kind === TrackEnum.Kind.Video && videoRef.current) {
            track.attach(videoRef.current);
            attachedVideoRef.current = track;
          } else if (track.kind === TrackEnum.Kind.Audio && audioRef.current) {
            track.attach(audioRef.current);
            attachedAudioRef.current = track;
          }
          if (!cancelled) setState({ phase: "active" });
        },
      );

      // Event: track unsubscribed. Cleanup attachów.
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach();
        if (attachedVideoRef.current === track) attachedVideoRef.current = null;
        if (attachedAudioRef.current === track) attachedAudioRef.current = null;
      });

      // Event: publisher rozłączył się. Wracamy do "waiting" — można poprosić
      // o ponowne zeskanowanie QR (room żyje 30 min).
      room.on(
        RoomEvent.ParticipantDisconnected,
        (p: RemoteParticipant) => {
          if (isPublisherParticipant(p)) {
            if (!cancelled) setState({ phase: "waiting" });
          }
        },
      );

      // Event: rozłączenie po naszej stronie (np. server kicked, network).
      room.on(RoomEvent.Disconnected, () => {
        if (!cancelled) {
          setState((prev) =>
            prev.phase === "active" || prev.phase === "waiting"
              ? { phase: "waiting" }
              : prev,
          );
        }
      });

      try {
        await room.connect(payload.url, payload.token);
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: "error",
          message:
            err instanceof Error
              ? `Połączenie z serwerem live nie powiodło się: ${err.message}`
              : "Połączenie z serwerem live nie powiodło się.",
        });
        return;
      }

      if (cancelled) {
        // Jeśli unmount nastąpił podczas connect — od razu disconnect.
        await room.disconnect().catch(() => undefined);
        return;
      }

      createdRoom = room;
      roomRef.current = room;

      // Sprawdź czy publisher już jest w room (race: connect może zakończyć
      // się PO ParticipantConnected dla istniejących uczestników — LiveKit
      // emituje eventy dla pre-existing participants po connect).
      const remotes = Array.from(room.remoteParticipants.values());
      const publisher = remotes.find(isPublisherParticipant);
      if (publisher) {
        setState({ phase: "active" });
      } else {
        setState({ phase: "waiting" });
      }
    };

    void setup();

    // beforeunload — gwarantuje disconnect przy zamknięciu karty (cheap
    // insurance, alternatywą jest 30-min idle timeout LiveKit).
    const onPageHide = () => {
      if (createdRoom) {
        // disconnect zwraca Promise — bez await, pagehide nie czeka.
        void createdRoom.disconnect();
      }
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onPageHide);
      // Detach tracks żeby <video>/<audio> przestały odtwarzać natychmiast
      // (samo `disconnect` to robi, ale w innej kolejności — dwie sekwencje
      // zapobiegają migotaniu klatki na unmount).
      if (attachedVideoRef.current) {
        attachedVideoRef.current.detach();
        attachedVideoRef.current = null;
      }
      if (attachedAudioRef.current) {
        attachedAudioRef.current.detach();
        attachedAudioRef.current = null;
      }
      if (roomRef.current) {
        void roomRef.current.disconnect();
        roomRef.current = null;
      } else if (createdRoom) {
        void (createdRoom as Room).disconnect();
      }
    };
    // roomName & onClose nie zmieniają się w ramach jednego "otwarcia" modal —
    // RequestLiveViewButton zamyka modal i tworzy nowy przy ponownym kliku.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  const handleEnd = useCallback(() => {
    onClose();
  }, [onClose]);

  const toggleAudio = useCallback(() => {
    setAudioMuted((m) => {
      const next = !m;
      if (audioRef.current) audioRef.current.muted = next;
      return next;
    });
  }, []);

  const headerLabel = ticketNumber
    ? `Live z urządzenia · #${ticketNumber}`
    : "Live z urządzenia";

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(0,0,0,0.78)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-device-viewer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleEnd();
      }}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl border shadow-2xl flex flex-col"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
          maxHeight: "calc(100vh - 1.5rem)",
        }}
        data-service-id={serviceId}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="min-w-0">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--accent)" }}
            >
              Live podgląd
            </p>
            <h2
              id="live-device-viewer-title"
              className="text-base font-semibold leading-tight truncate"
            >
              {headerLabel}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleEnd}
              className="p-2 rounded-lg"
              style={{ color: "var(--text-muted)" }}
              aria-label="Zamknij"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {state.phase === "error" && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg p-3 text-sm"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                color: "#fca5a5",
              }}
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{state.message}</span>
            </div>
          )}

          {(state.phase === "loading-token" ||
            state.phase === "connecting") && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2
                className="h-6 w-6 animate-spin"
                style={{ color: "var(--accent)" }}
              />
              <p
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {state.phase === "loading-token"
                  ? "Pobieranie tokenu…"
                  : "Łączenie z serwerem live…"}
              </p>
            </div>
          )}

          {state.phase === "waiting" && (
            <WaitingState
              qrCodeDataUrl={qrCodeDataUrl}
              publisherUrl={publisherUrl}
            />
          )}

          {/* Active state — render zawsze gdy mamy room (nawet w `waiting`)
              żeby attach do <video> nie zgubił referencji gdy publisher
              dołączy w czasie pomiędzy event a re-render. Chowamy
              wizualnie gdy nie active. */}
          <div
            className={state.phase === "active" ? "block" : "hidden"}
            aria-hidden={state.phase !== "active"}
          >
            <div
              className="relative w-full overflow-hidden rounded-xl bg-black"
              style={{ aspectRatio: "16 / 9" }}
            >
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-contain bg-black"
                autoPlay
                playsInline
                // Mute video element — audio leci osobnym tagiem żeby
                // niezależnie sterować mute.
                muted
                aria-label="Live stream z urządzenia mobilnego"
              />
              <audio
                ref={audioRef}
                autoPlay
                aria-label="Audio z urządzenia mobilnego"
              />
            </div>
            <div
              className="mt-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
              style={{
                borderColor: "var(--border-subtle)",
                background: "var(--bg-surface)",
              }}
            >
              <span
                className="flex items-center gap-2"
                style={{ color: "#86efac" }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: "#22c55e" }}
                  aria-hidden="true"
                />
                Na żywo
              </span>
              <button
                type="button"
                onClick={toggleAudio}
                className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px]"
                style={{
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
                aria-pressed={audioMuted}
                aria-label={
                  audioMuted ? "Włącz dźwięk" : "Wycisz dźwięk lokalnie"
                }
                title={
                  audioMuted
                    ? "Włącz dźwięk (sprzedawca nadal słyszy)"
                    : "Wycisz dźwięk lokalnie (sprzedawca nadal słyszy)"
                }
              >
                {audioMuted ? (
                  <VolumeX className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
                {audioMuted ? "Wyciszone" : "Słychać"}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3 border-t"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <button
            type="button"
            onClick={handleEnd}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{
              background: "#dc2626",
              color: "#fff",
            }}
          >
            <PhoneOff className="h-3.5 w-3.5" aria-hidden="true" />
            Zakończ rozmowę
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Sub-komponent — widok "waiting" (publisher jeszcze nie dołączył). Wyświetla
 * QR code (server-side rendered jako data URL) + tekst instrukcji.
 */
function WaitingState({
  qrCodeDataUrl,
  publisherUrl,
}: {
  qrCodeDataUrl: string | null;
  publisherUrl: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p
        className="text-xs text-center"
        style={{ color: "var(--text-muted)" }}
      >
        Poproś sprzedawcę, aby zeskanował kod QR telefonem. Link otworzy
        kamerę i prześle obraz na żywo.
      </p>
      {qrCodeDataUrl ? (
        <div className="rounded-2xl bg-white p-3">
          {/* QR data URL pochodzi z trusted backend — render bez dangerously,
              <img> bez onError/CORS issues bo data: URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrCodeDataUrl}
            alt="Kod QR z linkiem live view"
            className="block"
            width={280}
            height={280}
          />
        </div>
      ) : (
        <div
          className="flex h-[280px] w-[280px] items-center justify-center rounded-2xl bg-white"
          style={{ color: "#94a3b8" }}
        >
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      <div
        className="flex w-full items-center gap-2"
      >
        <input
          type="text"
          readOnly
          value={publisherUrl}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          className="flex-1 truncate rounded-lg border px-2 py-1.5 text-[11px] outline-none"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
          aria-label="Link do livestream"
        />
      </div>
      <div
        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs w-full justify-center"
        style={{
          borderColor: "var(--border-subtle)",
          background: "var(--bg-surface)",
          color: "var(--text-muted)",
        }}
        aria-live="polite"
      >
        <Loader2
          className="h-3.5 w-3.5 animate-spin"
          style={{ color: "var(--accent)" }}
        />
        Czekamy aż sprzedawca dołączy…
      </div>
    </div>
  );
}

