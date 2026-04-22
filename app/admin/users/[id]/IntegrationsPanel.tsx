"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Link2Off, Loader2 } from "lucide-react";

import { Alert, Badge, Button, Card } from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import {
  adminUserService,
  type AdminIntegrationStatus,
} from "@/app/account/account-service";

interface IntegrationsPanelProps {
  userId: string;
}

export function IntegrationsPanel({ userId }: IntegrationsPanelProps) {
  const [status, setStatus] = useState<AdminIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"google" | "kadromierz" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminUserService.getIntegrations(userId);
      setStatus(res);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się pobrać integracji",
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const unlink = useCallback(
    async (provider: "google" | "kadromierz") => {
      if (
        !window.confirm(
          `Odłączyć integrację ${provider === "google" ? "Google" : "Kadromierz"}?\n\nUser straci dostęp do synchronizacji kalendarza/grafiku aż do ponownego powiązania.`,
        )
      )
        return;
      setError(null);
      setNotice(null);
      setBusy(provider);
      try {
        await adminUserService.unlinkIntegration(userId, provider);
        setNotice(
          provider === "google"
            ? "Konto Google odłączone."
            : "Kadromierz odłączony.",
        );
        await load();
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Odłączenie nieudane",
        );
      } finally {
        setBusy(null);
      }
    },
    [userId, load],
  );

  if (loading) {
    return (
      <Card padding="md">
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Ładowanie integracji…
        </div>
      </Card>
    );
  }

  if (!status) {
    return (
      <Alert tone="error">{error ?? "Brak danych o integracjach"}</Alert>
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* GOOGLE */}
        <Card padding="md">
          <header className="flex items-start justify-between gap-2 mb-3">
            <div>
              <h3 className="font-semibold text-sm text-[var(--text-main)]">
                Google
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Kalendarz i synchronizacja wydarzeń.
              </p>
            </div>
            {status.google.connected ? (
              <Badge tone="success">
                <Link2 className="w-3 h-3 mr-1" aria-hidden="true" />
                połączone
              </Badge>
            ) : (
              <Badge tone="neutral">nie połączone</Badge>
            )}
          </header>

          {status.google.connected && (
            <div className="text-xs text-[var(--text-muted)] space-y-0.5 mb-3">
              <div>
                <span className="font-medium text-[var(--text-main)]">
                  {status.google.username ?? "—"}
                </span>
              </div>
              {status.google.userId && (
                <div className="font-mono text-[10px] opacity-70">
                  {status.google.userId}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {status.google.connected ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void unlink("google")}
                loading={busy === "google"}
                disabled={!!busy}
                leftIcon={<Link2Off className="w-4 h-4" aria-hidden="true" />}
                className="text-red-500 hover:text-red-600"
              >
                Odłącz
              </Button>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                User łączy konto Google samodzielnie ze swojego konta
                (/account → Integracje).
              </p>
            )}
          </div>
        </Card>

        {/* KADROMIERZ */}
        <Card padding="md">
          <header className="flex items-start justify-between gap-2 mb-3">
            <div>
              <h3 className="font-semibold text-sm text-[var(--text-main)]">
                Kadromierz
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Grafik i ewidencja czasu pracy.
              </p>
            </div>
            {status.kadromierz.connected ? (
              <Badge tone="success">
                <Link2 className="w-3 h-3 mr-1" aria-hidden="true" />
                połączone
              </Badge>
            ) : (
              <Badge tone="neutral">nie połączone</Badge>
            )}
          </header>

          {status.kadromierz.connected && (
            <div className="text-xs text-[var(--text-muted)] space-y-0.5 mb-3">
              <div>
                Firma: <span className="font-mono">{status.kadromierz.companyId ?? "—"}</span>
              </div>
              <div>
                Employee: <span className="font-mono">{status.kadromierz.employeeId ?? "—"}</span>
              </div>
              {status.kadromierz.connectedAt && (
                <div>
                  Od: {new Date(status.kadromierz.connectedAt).toLocaleString("pl-PL")}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {status.kadromierz.connected ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void unlink("kadromierz")}
                loading={busy === "kadromierz"}
                disabled={!!busy}
                leftIcon={<Link2Off className="w-4 h-4" aria-hidden="true" />}
                className="text-red-500 hover:text-red-600"
              >
                Odłącz
              </Button>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                User łączy Kadromierz samodzielnie (/account → Integracje).
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
