"use client";

/**
 * Wave 22 / F16d — RequestLiveViewButton
 *
 * Przycisk w headerze widoku zlecenia (ServiceDetailView). Kliknięcie:
 *   1. POST `/api/relay/livekit/request-view` → backend tworzy LiveKit room
 *      + publisher token + QR data URL.
 *   2. Otwiera <LiveDeviceViewer/> modal z QR (waiting) → live (active).
 *
 * State machine: `idle | requesting | active`. `error` jest mniejszą ścieżką
 * (toast banner) — po błędzie wracamy do `idle` żeby user mógł retry'ować.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Video } from "lucide-react";
import { LiveDeviceViewer } from "./LiveDeviceViewer";

interface RequestLiveViewButtonProps {
  serviceId: string;
  /** Numer ticketu — przekazywany do LiveDeviceViewer (header). */
  ticketNumber?: string | null;
  /**
   * Variant `solid` = primary CTA (np. nagłówek), `ghost` = drugorzędny
   * (np. dropdown). Domyślnie solid.
   */
  variant?: "solid" | "ghost";
  /** Compact = bez tekstu (tylko ikona) — używane w wąskich headerach. */
  compact?: boolean;
}

interface RequestViewResponse {
  roomName: string;
  publisherUrl: string;
  qrCodeDataUrl: string | null;
  expiresAt: string;
  livekitUrl: string;
  error?: string;
}

type State =
  | { phase: "idle" }
  | { phase: "requesting" }
  | {
      phase: "active";
      roomName: string;
      publisherUrl: string;
      qrCodeDataUrl: string | null;
    };

export function RequestLiveViewButton({
  serviceId,
  ticketNumber,
  variant = "solid",
  compact = false,
}: RequestLiveViewButtonProps) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [error, setError] = useState<string | null>(null);

  // Auto-dismiss error po 6s (banner inline pod przyciskiem nie blokuje
  // UI — toast feel bez zewnętrznej zależności).
  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), 6_000);
    return () => window.clearTimeout(id);
  }, [error]);

  const requestView = useCallback(async () => {
    if (state.phase === "requesting") return;
    setError(null);
    setState({ phase: "requesting" });
    try {
      const r = await fetch(`/api/relay/livekit/request-view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId }),
      });
      const j = (await r.json()) as RequestViewResponse;
      if (!r.ok) {
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      setState({
        phase: "active",
        roomName: j.roomName,
        publisherUrl: j.publisherUrl,
        qrCodeDataUrl: j.qrCodeDataUrl,
      });
    } catch (err) {
      setState({ phase: "idle" });
      setError(
        err instanceof Error
          ? err.message
          : "Nie udało się uruchomić live view.",
      );
    }
  }, [serviceId, state.phase]);

  const handleClose = useCallback(() => {
    // F16e webhook (out-of-scope) zaloguje `live_view_ended` server-side gdy
    // LiveKit emituje `room_finished`. Tu wystarczy ustawić idle —
    // LiveDeviceViewer cleanup zrobi `room.disconnect()` w useEffect cleanup.
    setState({ phase: "idle" });
  }, []);

  const isLoading = state.phase === "requesting";

  const buttonClass =
    variant === "solid"
      ? "px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-60"
      : "p-2 rounded-lg border inline-flex items-center gap-1.5 disabled:opacity-60";

  return (
    <>
      <div className="relative inline-flex flex-col items-end">
        <button
          type="button"
          onClick={() => void requestView()}
          disabled={isLoading || state.phase === "active"}
          className={buttonClass}
          style={
            variant === "solid"
              ? {
                  background: "var(--accent)",
                  color: "#fff",
                }
              : {
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-muted)",
                }
          }
          aria-label={compact ? "Pokaż urządzenie na żywo" : undefined}
          title="Otwórz live podgląd kamery telefonu sprzedawcy"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Video className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {!compact && (
            <span>
              {isLoading ? "Łączenie…" : "Pokaż na żywo"}
            </span>
          )}
        </button>
        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="absolute top-full mt-1.5 right-0 z-[1500] max-w-xs rounded-lg border px-2.5 py-1.5 text-[11px] shadow-lg"
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              borderColor: "rgba(239, 68, 68, 0.4)",
              color: "#fca5a5",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {state.phase === "active" && (
        <LiveDeviceViewer
          serviceId={serviceId}
          ticketNumber={ticketNumber ?? null}
          roomName={state.roomName}
          publisherUrl={state.publisherUrl}
          qrCodeDataUrl={state.qrCodeDataUrl}
          onClose={handleClose}
        />
      )}
    </>
  );
}
