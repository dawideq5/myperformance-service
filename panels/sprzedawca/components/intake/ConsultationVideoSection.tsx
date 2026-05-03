"use client";

/**
 * Wave 23 (overlay) — ConsultationVideoSection (QR-only)
 *
 * Sekcja w intake formularzu sprzedawcy. Pozwala wygenerować QR code,
 * który po zeskanowaniu przez TELEFON klienta (lub sprzedawcy) podłącza
 * mobile publisher PWA jako publishera w LiveKit roomie.
 *
 * Browser camera laptopa NIE jest używana — flow przesunięty na mobilny
 * publisher (apps/upload-bridge/livestream).
 *
 * Flow:
 *   1. Klik "Rozpocznij konsultację" → POST /api/relay/livekit/start-publisher
 *      (z serviceId/conversationId).
 *   2. Backend: tworzy LiveKit room, mintuje mobile publisher token,
 *      buduje URL do upload-bridge PWA, generuje QR data URL, podpisuje
 *      join token, wstrzykuje PRIVATE NOTE do Chatwoot conversation.
 *   3. UI: QR code 256px + tekstowy URL + status badge.
 *   4. Polling co 5 s `/api/livekit/room-status?room=X&token=joinToken`:
 *      - "waiting" → "⏳ Oczekuje na zeskanowanie kodu"
 *      - "active"  → "🟢 Połączono"
 *      - "ended"   → "Konsultacja zakończona"
 *   5. Zakończ → POST /api/relay/livekit/end-room.
 */

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Loader2,
  QrCode,
  Radio,
  Video,
  VideoOff,
} from "lucide-react";

interface ConsultationVideoSectionProps {
  /** Optional — gdy formularz dotyczy istniejącego ticketu (edit mode). */
  serviceId?: string | null;
  /** Optional — Chatwoot conversation id powiązany z klientem. */
  chatwootConversationId?: number | null;
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
  error?: string;
}

interface RoomStatusResponse {
  roomName: string;
  status: "waiting" | "active" | "ended" | "unknown";
  publisherConnected: boolean;
  participantCount: number;
  liveKitReachable: boolean;
  startedAt: string | null;
  createdAt: string | null;
  endedAt: string | null;
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
      joinUrl: string;
      joinToken: string;
      chatwootMessageSent: boolean;
      startedAtMs: number;
      liveStatus: "waiting" | "active" | "ended" | "unknown";
    }
  | {
      kind: "ended";
      roomName: string;
      durationSec: number;
    };

const STATUS_POLL_MS = 5_000;

export function ConsultationVideoSection({
  serviceId,
  chatwootConversationId,
}: ConsultationVideoSectionProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Ephemeral error auto-dismiss.
  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), 6_000);
    return () => window.clearTimeout(id);
  }, [error]);

  // Status polling — runs only when phase=active.
  useEffect(() => {
    if (phase.kind !== "active") return;
    const roomName = phase.roomName;
    const joinToken = phase.joinToken;
    let cancelled = false;

    const tick = async () => {
      try {
        const r = await fetch(
          `/api/relay/livekit/room-status?room=${encodeURIComponent(roomName)}&token=${encodeURIComponent(joinToken)}`,
          { cache: "no-store" },
        );
        const body = (await r.json()) as RoomStatusResponse;
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        if (cancelled) return;
        // Update only liveStatus pole — pozostała część jest niezmienna.
        setPhase((prev) =>
          prev.kind === "active" && prev.roomName === roomName
            ? { ...prev, liveStatus: body.status }
            : prev,
        );
      } catch {
        // ignore — polling jest best-effort, nie blokujemy UX.
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), STATUS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [phase]);

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

      setPhase({
        kind: "active",
        roomName: body.roomName,
        mobilePublisherUrl: body.mobilePublisherUrl,
        qrCodeDataUrl: body.qrCodeDataUrl,
        joinUrl: body.joinUrl,
        joinToken: body.joinToken,
        chatwootMessageSent: body.chatwootMessageSent,
        startedAtMs: Date.now(),
        liveStatus: "waiting",
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Nie udało się rozpocząć konsultacji.",
      );
      setPhase({ kind: "idle" });
    }
  }, [phase.kind, serviceId, chatwootConversationId]);

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
      // ignore — webhook will eventually fire room_finished from idle timeout.
    }
    const durationSec = Math.max(
      0,
      Math.floor((Date.now() - startedAtMs) / 1000),
    );
    setPhase({ kind: "ended", roomName, durationSec });
  }, [phase]);

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
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
            Wygeneruj kod QR — klient zeskanuje go telefonem i podłączy
            kamerę. Link do dołączenia jako uczestnik trafia do rozmowy
            z agentem Chatwoot.
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
          <QrCode className="w-4 h-4" aria-hidden="true" />
          Rozpocznij konsultację
        </button>
      )}

      {phase.kind === "starting" && (
        <div
          className="text-sm inline-flex items-center gap-2"
          style={{ color: "var(--text-muted)" }}
        >
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Tworzenie pokoju + generowanie kodu QR…
        </div>
      )}

      {phase.kind === "active" && (
        <div className="space-y-3">
          {/* QR + status row */}
          <div className="flex items-start gap-4 flex-col sm:flex-row">
            <div
              className="rounded-xl p-3 flex-shrink-0 mx-auto sm:mx-0"
              style={{
                background: "#fff",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={phase.qrCodeDataUrl}
                alt="QR code do skanu telefonem"
                width={220}
                height={220}
                className="block"
              />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <StatusBadge status={phase.liveStatus} />
              {phase.chatwootMessageSent ? (
                <div
                  className="text-xs flex items-center gap-1.5"
                  style={{ color: "var(--success, #10b981)" }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Link do dołączenia wysłany do rozmowy Chatwoot
                </div>
              ) : (
                <p
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Brak rozmowy Chatwoot dla tego zlecenia. Skopiuj link
                  ręcznie i wklej w czacie:
                </p>
              )}
              {/* Mobile publisher URL — alternatywa dla skanu QR. */}
              <div className="space-y-1.5">
                <p
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Link do mobile publishera
                </p>
                <CopyableField
                  value={phase.mobilePublisherUrl}
                  copied={copied}
                  onCopy={() => void copyText(phase.mobilePublisherUrl)}
                />
              </div>
              {!phase.chatwootMessageSent && (
                <div className="space-y-1.5">
                  <p
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Link dla agenta (subscriber)
                  </p>
                  <CopyableField
                    value={phase.joinUrl}
                    copied={copied}
                    onCopy={() => void copyText(phase.joinUrl)}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end">
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
              Zakończ konsultację
            </button>
          </div>
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

function StatusBadge({
  status,
}: {
  status: "waiting" | "active" | "ended" | "unknown";
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
        <Radio
          className="w-3 h-3 animate-pulse"
          aria-hidden="true"
        />
        Połączono — trwa rozmowa
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
        Pokój zakończony
      </span>
    );
  }
  // waiting / unknown
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
      style={{
        background: "rgba(245, 158, 11, 0.15)",
        color: "var(--warning, #f59e0b)",
      }}
    >
      <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
      Oczekuje na zeskanowanie kodu
    </span>
  );
}

function CopyableField({
  value,
  copied,
  onCopy,
}: {
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 text-xs p-2 rounded-lg"
      style={{
        background: "rgba(0,0,0,0.05)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <input
        readOnly
        value={value}
        className="flex-1 bg-transparent outline-none truncate"
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        onClick={onCopy}
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
          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
