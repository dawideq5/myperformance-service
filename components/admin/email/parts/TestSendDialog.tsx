"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { Alert, Button, Card, Input } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";

export function TestSendDialog({
  actionKey,
  draftSubject,
  draftBody,
  layoutId,
  smtpConfigId,
  onClose,
}: {
  actionKey: string;
  draftSubject: string;
  draftBody: string;
  layoutId: string | null;
  smtpConfigId: string | null;
  onClose: () => void;
}) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<
        { messageId: string },
        {
          to: string;
          draftSubject: string;
          draftBody: string;
          layoutId: string | null;
          smtpConfigId: string | null;
        }
      >(
        `/api/admin/email/templates/${encodeURIComponent(actionKey)}/send-test`,
        { to, draftSubject, draftBody, layoutId, smtpConfigId },
      );
      setDone(`Wysłane (id: ${r.messageId}). Sprawdź skrzynkę ${to}.`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <Card padding="lg" className="w-full max-w-md">
        <h3 className="text-base font-semibold mb-2">Wyślij testowo</h3>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Wysyła aktualną treść (z niezapisanych zmian) na podany adres.
          Zmienne wypełniane są przykładami z katalogu.
        </p>
        {error && (
          <Alert tone="error" className="mb-3">
            {error}
          </Alert>
        )}
        {done && (
          <Alert tone="success" className="mb-3">
            {done}
          </Alert>
        )}
        <Input
          label="Adres odbiorcy"
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="ty@example.com"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Zamknij
          </Button>
          <Button
            onClick={send}
            loading={busy}
            disabled={!to.trim()}
            leftIcon={<Send className="w-4 h-4" />}
          >
            Wyślij
          </Button>
        </div>
      </Card>
    </div>
  );
}
