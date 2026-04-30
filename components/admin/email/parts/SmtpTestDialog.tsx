"use client";

import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";

import { Alert, Button, Card, Input } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";

import type { SmtpConfigFull } from "../types";

export function SmtpTestDialog({
  config,
  onClose,
}: {
  config: Partial<SmtpConfigFull>;
  onClose: () => void;
}) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    verified?: boolean;
    sent?: boolean;
    messageId?: string;
    accepted?: string[];
    error?: string;
    errorCode?: string;
    hint?: string;
  } | null>(null);

  async function runTest() {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.post<
        typeof result,
        Partial<SmtpConfigFull> & { to: string }
      >("/api/admin/email/smtp-configs/test", {
        to,
        smtpHost: config.smtpHost!,
        smtpPort: config.smtpPort ?? 25,
        smtpUser: config.smtpUser ?? null,
        smtpPassword:
          config.smtpPassword === "***" ? null : config.smtpPassword ?? null,
        useTls: config.useTls ?? false,
        fromEmail: config.fromEmail!,
        fromDisplay: config.fromDisplay ?? null,
        replyTo: config.replyTo ?? null,
      });
      setResult(r);
    } catch (err) {
      setResult({
        error: err instanceof ApiRequestError ? err.message : "Test failed",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <Card padding="lg" className="w-full max-w-lg">
        <h3 className="text-base font-semibold mb-2">Testuj połączenie SMTP</h3>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Najpierw nawiązuje połączenie i autoryzuje (verify), potem wysyła
          testowy email. Każdy etap raportowany osobno — łatwo zdiagnozować
          gdzie problem.
        </p>
        <div className="grid grid-cols-2 gap-2 text-[11px] mb-4 p-3 rounded bg-[var(--bg-main)]">
          <div className="text-[var(--text-muted)]">Host:</div>
          <div className="font-mono">
            {config.smtpHost}:{config.smtpPort}
          </div>
          <div className="text-[var(--text-muted)]">TLS:</div>
          <div>{config.useTls ? "tak (SSL/TLS)" : "nie (plain/STARTTLS)"}</div>
          <div className="text-[var(--text-muted)]">User:</div>
          <div className="font-mono">{config.smtpUser || "(brak)"}</div>
          <div className="text-[var(--text-muted)]">From:</div>
          <div className="font-mono">{config.fromEmail}</div>
        </div>
        <Input
          label="Wyślij test na adres"
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="ty@example.com"
        />
        {result && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              {result.verified ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <X className="w-4 h-4 text-red-400" />
              )}
              <span>
                Połączenie + autoryzacja: {result.verified ? "OK" : "FAILED"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {result.sent ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <X className="w-4 h-4 text-red-400" />
              )}
              <span>
                Wysyłka:{" "}
                {result.sent ? `OK (id: ${result.messageId})` : "FAILED"}
              </span>
            </div>
            {result.error && (
              <Alert tone="error">
                <strong>Błąd:</strong> {result.error}
                {result.errorCode && (
                  <code className="ml-2 text-[10px]">[{result.errorCode}]</code>
                )}
                {result.hint && (
                  <div className="mt-2 text-xs">{result.hint}</div>
                )}
              </Alert>
            )}
            {result.sent && (
              <Alert tone="success">
                Sprawdź skrzynkę {to} — testowa wiadomość powinna dotrzeć w
                ciągu kilku sekund.
              </Alert>
            )}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Zamknij
          </Button>
          <Button
            onClick={runTest}
            loading={busy}
            disabled={!to.trim() || !config.smtpHost || !config.fromEmail}
          >
            Uruchom test
          </Button>
        </div>
      </Card>
    </div>
  );
}
