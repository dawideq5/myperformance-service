"use client";

/**
 * Wave 24 — IncomingVideoCallDialog
 *
 * Modal popup w panelu sprzedawcy gdy agent Chatwoot zainicjuje rozmowę
 * video. Otwiera się automatycznie po otrzymaniu SSE event `livekit_invite`
 * filtrowanego po conversation_id (z `useChatwootConversation`).
 *
 * Treść:
 *  - "{{agentName}} zaprasza Cię do rozmowy wideo"
 *  - Pre-rendered QR (mobilePublisherUrl) — sprzedawca skanuje telefonem
 *    i podłącza kamerę telefonu jako mobile publishera
 *  - Link tekstowy + copy button (alternatywa)
 *  - Przycisk "Zakończ rozmowę" — POST /api/relay/livekit/end-room → modal
 *    znika i pozwala rozpocząć nową
 *
 * Modal zamyka się automatycznie gdy:
 *  - przyjdzie SSE event `livekit_room_ended` (webhook room_finished, lub
 *    sprzedawca/agent ręcznie zakończył)
 *  - sprzedawca kliknie "Zakończ rozmowę"
 *  - sprzedawca kliknie X (zamykamy popup ale pokój dalej żyje aż do
 *    empty timeout 30 min lub manual end)
 *
 * Po zamknięciu modal może być ponownie otwarty przez kolejny `livekit_invite`
 * — agent może zainicjować nową rozmowę bez restartu.
 */

import { useCallback, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, PhoneOff, Video, X } from "lucide-react";

export interface VideoInvite {
  conversationId: number;
  roomName: string;
  mobilePublisherUrl: string;
  qrCodeDataUrl: string;
  joinUrl: string;
  joinToken: string;
  agentName: string | null;
  expiresAt: string;
}

interface IncomingVideoCallDialogProps {
  invite: VideoInvite | null;
  onClose: () => void;
}

export function IncomingVideoCallDialog({
  invite,
  onClose,
}: IncomingVideoCallDialogProps) {
  const [copied, setCopied] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  const copyLink = useCallback(async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.mobilePublisherUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [invite]);

  const endCall = useCallback(async () => {
    if (!invite) return;
    setEnding(true);
    setEndError(null);
    try {
      const r = await fetch(`/api/relay/livekit/end-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName: invite.roomName }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      // SSE event livekit_room_ended z bus dotrze chwilę później i zamknie
      // dialog automatycznie, ale dla snappy UX zamykamy od razu.
      onClose();
    } catch (err) {
      setEndError(
        err instanceof Error ? err.message : "Nie udało się zakończyć rozmowy.",
      );
    } finally {
      setEnding(false);
    }
  }, [invite, onClose]);

  if (!invite) return null;

  const agentLabel = invite.agentName?.trim() || "Agent serwisu";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="incoming-video-call-title"
    >
      <div
        className="w-full max-w-md rounded-2xl"
        style={{
          background: "var(--bg-card, #12121a)",
          border: "1px solid var(--border-subtle, #1e1e2e)",
          color: "var(--text-main, #f1f1f4)",
          boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
        }}
      >
        <header
          className="px-5 py-3 flex items-center justify-between gap-3 border-b"
          style={{ borderColor: "var(--border-subtle, #1e1e2e)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: "var(--accent, #6366f1)" }}
              aria-hidden="true"
            />
            <h2
              id="incoming-video-call-title"
              className="text-sm font-semibold flex items-center gap-2"
            >
              <Video
                className="w-4 h-4"
                style={{ color: "var(--accent, #6366f1)" }}
                aria-hidden="true"
              />
              Zaproszenie do rozmowy wideo
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="p-1.5 rounded-lg hover:bg-white/5"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--text-main, #f1f1f4)" }}
          >
            <strong style={{ color: "var(--accent, #6366f1)" }}>
              {agentLabel}
            </strong>{" "}
            zaprasza Cię do rozmowy wideo. Zeskanuj kod QR telefonem, aby
            podłączyć kamerę telefonu jako mobile publisher.
          </p>

          <div
            className="rounded-xl p-3 mx-auto"
            style={{
              background: "#fff",
              border: "1px solid var(--border-subtle, #1e1e2e)",
              width: 240,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={invite.qrCodeDataUrl}
              alt="Kod QR — zeskanuj telefonem aby dołączyć"
              width={216}
              height={216}
              className="block mx-auto"
            />
          </div>

          <div className="flex items-center justify-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{
                background: "rgba(255,255,255,0.05)",
                color: "var(--text-main, #f1f1f4)",
              }}
            >
              {copied ? (
                <CheckCircle2
                  className="w-3.5 h-3.5"
                  style={{ color: "#10b981" }}
                  aria-hidden="true"
                />
              ) : (
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {copied ? "Skopiowano" : "Kopiuj link"}
            </button>
            <a
              href={invite.mobilePublisherUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{
                background: "rgba(255,255,255,0.05)",
                color: "var(--text-main, #f1f1f4)",
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              Otwórz link bezpośrednio
            </a>
          </div>

          {endError && (
            <div
              role="alert"
              className="text-xs px-3 py-2 rounded-lg"
              style={{
                background: "rgba(239, 68, 68, 0.12)",
                color: "#fca5a5",
                border: "1px solid rgba(239, 68, 68, 0.35)",
              }}
            >
              {endError}
            </div>
          )}

          <button
            type="button"
            onClick={() => void endCall()}
            disabled={ending}
            className="w-full px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
            style={{
              background: "rgba(239, 68, 68, 0.15)",
              color: "#fca5a5",
              border: "1px solid rgba(239, 68, 68, 0.35)",
            }}
          >
            <PhoneOff className="w-4 h-4" aria-hidden="true" />
            {ending ? "Kończenie…" : "Zakończ rozmowę"}
          </button>
        </div>

        <footer
          className="px-5 py-2 text-[10px] text-center border-t"
          style={{
            borderColor: "var(--border-subtle, #1e1e2e)",
            color: "var(--text-muted, #6b6b7b)",
          }}
        >
          Pokój: <span className="font-mono">{invite.roomName}</span>
        </footer>
      </div>
    </div>
  );
}
