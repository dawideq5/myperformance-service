"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Send,
} from "lucide-react";

type Channel = "sms" | "email" | "chatwoot";

interface CustomerMessageSenderProps {
  serviceId: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  /**
   * Wywoływane po sukcesie — np. żeby parent (KlientTab → ChatwootDeepLink)
   * odświeżył listę konwersacji / emaili.
   */
  onSent?: (channel: Channel) => void;
}

interface ChannelMeta {
  id: Channel;
  label: string;
  icon: typeof Mail;
  bodyMax: number;
  /** Hint w charcounter — limit po którym zaczyna się kolejny segment SMS itp. */
  segmentHint?: number;
}

const CHANNELS: ChannelMeta[] = [
  {
    id: "sms",
    label: "SMS",
    icon: Phone,
    bodyMax: 1000,
    segmentHint: 160,
  },
  { id: "email", label: "Email", icon: Mail, bodyMax: 10_000 },
  { id: "chatwoot", label: "Chatwoot", icon: MessageSquare, bodyMax: 4_000 },
];

/**
 * Sekcja "Wyślij wiadomość" w KlientTab. Wybór kanału (SMS/email/chatwoot),
 * formularz body + opcjonalny temat dla email, charcounter z hintem segmentów
 * SMS, POST do `/api/relay/services/[id]/customer-messages`. Po sukcesie:
 * inline success + clear form + callback `onSent` (refresh ChatwootDeepLink).
 */
export function CustomerMessageSender({
  serviceId,
  customerEmail,
  customerPhone,
  onSent,
}: CustomerMessageSenderProps) {
  const [channel, setChannel] = useState<Channel>(() => {
    if (customerPhone) return "sms";
    if (customerEmail) return "email";
    return "chatwoot";
  });
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const meta = useMemo(
    () => CHANNELS.find((c) => c.id === channel) ?? CHANNELS[0],
    [channel],
  );

  const channelDisabled = (id: Channel): boolean => {
    if (id === "sms") return !customerPhone;
    if (id === "email") return !customerEmail;
    if (id === "chatwoot") return !customerPhone && !customerEmail;
    return true;
  };

  const segmentCount =
    channel === "sms" && meta.segmentHint && body.length > 0
      ? Math.ceil(body.length / meta.segmentHint)
      : null;

  const submit = async () => {
    if (submitting) return;
    setError(null);
    setSuccess(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Treść wiadomości jest wymagana");
      return;
    }
    if (trimmed.length > meta.bodyMax) {
      setError(`Wiadomość przekracza ${meta.bodyMax} znaków`);
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, string> = { channel, body: trimmed };
      if (channel === "email" && subject.trim()) {
        payload.subject = subject.trim();
      }
      const r = await fetch(
        `/api/relay/services/${encodeURIComponent(serviceId)}/customer-messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const j = (await r.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        externalId?: string | number;
      } | null;
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      setSuccess(
        channel === "email"
          ? "Email wysłany do klienta"
          : channel === "sms"
            ? "SMS wysłany do klienta"
            : "Wiadomość wysłana w Chatwoot",
      );
      setBody("");
      setSubject("");
      onSent?.(channel);
      // Auto-clear success po 5s.
      window.setTimeout(() => setSuccess(null), 5_000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nie udało się wysłać wiadomości",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="rounded-2xl border overflow-hidden"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-main)",
      }}
      aria-labelledby="customer-message-heading"
    >
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <h3 id="customer-message-heading" className="text-sm font-semibold">
          Wyślij wiadomość do klienta
        </h3>
        <p
          className="text-[11px] mt-0.5"
          style={{ color: "var(--text-muted)" }}
        >
          Nowa konwersacja zostanie zarejestrowana w historii zlecenia.
        </p>
      </div>

      <div className="p-4 space-y-3">
        {/* Channel chips */}
        <div
          role="radiogroup"
          aria-label="Wybór kanału"
          className="flex flex-wrap gap-2"
        >
          {CHANNELS.map((c) => {
            const disabled = channelDisabled(c.id);
            const active = channel === c.id;
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled || submitting}
                onClick={() => {
                  setChannel(c.id);
                  setError(null);
                  setSuccess(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: active ? "var(--accent)" : "var(--bg-surface)",
                  borderColor: active ? "var(--accent)" : "var(--border-subtle)",
                  color: active ? "#fff" : "var(--text-main)",
                }}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {c.label}
                {disabled && (
                  <span
                    className="text-[10px]"
                    style={{ color: active ? "rgba(255,255,255,0.7)" : "var(--text-muted)" }}
                  >
                    {c.id === "sms"
                      ? " (brak tel.)"
                      : c.id === "email"
                        ? " (brak email)"
                        : " (brak danych)"}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Subject for email only */}
        {channel === "email" && (
          <div>
            <label
              htmlFor="customer-message-subject"
              className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Temat
            </label>
            <input
              id="customer-message-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Wiadomość do zlecenia"
              maxLength={200}
              disabled={submitting}
              className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            />
          </div>
        )}

        {/* Body */}
        <div>
          <label
            htmlFor="customer-message-body"
            className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Treść
          </label>
          <textarea
            id="customer-message-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              channel === "sms"
                ? "Krótka wiadomość SMS…"
                : channel === "email"
                  ? "Treść wiadomości — możesz używać markdown (*pogrubienie*, [link](url))"
                  : "Wiadomość do klienta w czacie Chatwoot…"
            }
            rows={channel === "sms" ? 3 : 6}
            maxLength={meta.bodyMax}
            disabled={submitting}
            aria-describedby="customer-message-counter"
            className="w-full px-3 py-2 rounded-lg text-sm border resize-y focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
              minHeight: channel === "sms" ? "72px" : "120px",
            }}
          />
          <div
            id="customer-message-counter"
            className="flex items-center justify-between mt-1 text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            <span>
              {body.length} / {meta.bodyMax}
              {segmentCount !== null && (
                <>
                  {" · "}
                  <span aria-live="polite">
                    {segmentCount} {segmentCount === 1 ? "segment" : "segmenty"} SMS
                  </span>
                </>
              )}
            </span>
            {channel === "sms" && meta.segmentHint && (
              <span aria-hidden="true">
                limit segmentu: {meta.segmentHint} znaków
              </span>
            )}
          </div>
        </div>

        {/* Status */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 p-2.5 rounded-lg text-xs"
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              color: "#fca5a5",
            }}
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div
            role="status"
            className="flex items-start gap-2 p-2.5 rounded-lg text-xs"
            style={{
              background: "rgba(34, 197, 94, 0.12)",
              color: "#86efac",
            }}
          >
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{success}</span>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || body.trim().length === 0 || channelDisabled(channel)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "var(--accent)",
              color: "#fff",
            }}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{submitting ? "Wysyłanie…" : "Wyślij"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
