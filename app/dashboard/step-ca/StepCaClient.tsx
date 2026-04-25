"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Unlock,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  PageShell,
} from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api-client";
import type { IssuedCertificate } from "@/lib/step-ca";

type PanelRole = "sprzedawca" | "serwisant" | "kierowca";

interface PanelState {
  role: PanelRole;
  label: string;
  domain: string;
  mtlsRequired: boolean;
  coolifyUuid: string;
}

interface Props {
  caUrl: string;
  certs: IssuedCertificate[];
  userLabel?: string;
  userEmail?: string;
}

export function StepCaClient({ caUrl, certs, userLabel, userEmail }: Props) {
  const [panels, setPanels] = useState<PanelState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<PanelRole | null>(null);

  // Reauth state — dialog confirm + redirect do KC.
  const [reauthFor, setReauthFor] = useState<{
    role: PanelRole;
    nextValue: boolean;
  } | null>(null);
  const [reauthPending, setReauthPending] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ panels: PanelState[] }>("/api/admin/panels/mtls-state");
      setPanels(r.panels);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Nie udało się pobrać stanu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const certsByRole = useMemo(() => {
    const map = new Map<PanelRole, IssuedCertificate[]>();
    for (const c of certs) {
      const cRoles = c.roles ?? (c.role ? c.role.split(",") : []);
      for (const r of cRoles) {
        const role = r.trim() as PanelRole;
        if (!["sprzedawca", "serwisant", "kierowca"].includes(role)) continue;
        const arr = map.get(role) ?? [];
        arr.push(c);
        map.set(role, arr);
      }
    }
    return map;
  }, [certs]);

  const requestToggle = (role: PanelRole, current: boolean) => {
    setReauthError(null);
    setReauthFor({ role, nextValue: !current });
  };

  const performToggle = useCallback(async () => {
    if (!reauthFor) return;
    setReauthPending(true);
    setReauthError(null);
    try {
      const r = await api.post<
        { authorizeUrl: string },
        {
          action: "panel-mtls-toggle";
          params: { role: PanelRole; mtlsRequired: boolean };
          returnTo: string;
        }
      >("/api/admin/step-up/init", {
        action: "panel-mtls-toggle",
        params: { role: reauthFor.role, mtlsRequired: reauthFor.nextValue },
        returnTo: "/dashboard/step-ca",
      });
      // Pełna nawigacja do Keycloak — KC native UI z polem hasła +
      // "Or sign in with Google". Po sukcesie redirect na callback który
      // wykonuje akcję i wraca tutaj z `?step_up_ok=...`.
      window.location.href = r.authorizeUrl;
    } catch (err) {
      setReauthError(
        err instanceof ApiRequestError ? err.message : "Nie udało się rozpocząć ponownej autentykacji",
      );
      setReauthPending(false);
    }
  }, [reauthFor]);

  // Po powrocie z KC callback — pokaż notice/error z query params.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    const ok = u.searchParams.get("step_up_ok");
    const err = u.searchParams.get("step_up_err");
    if (ok) {
      setNotice(ok);
      u.searchParams.delete("step_up_ok");
      window.history.replaceState({}, "", u.toString());
      void refresh();
    } else if (err) {
      setError(err);
      u.searchParams.delete("step_up_err");
      window.history.replaceState({}, "", u.toString());
    }
  }, [refresh]);

  const now = Date.now();

  return (
    <PageShell
      maxWidth="2xl"
      header={
        <AppHeader
          backHref="/dashboard"
          title="Step CA — serwisy chronione mTLS"
          userLabel={userLabel}
          userSubLabel={userEmail}
        />
      }
    >
      <section className="mb-6 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-7 h-7 text-teal-500" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm text-[var(--text-muted)] max-w-2xl">
            Lista paneli z wymogiem certyfikatu klienckiego (mTLS), liczba
            wystawionych certyfikatów i kto je posiada. Awaryjny przełącznik
            tymczasowo otwiera panel bez certyfikatu (wymaga ponownego
            uwierzytelnienia hasłem).
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            CA: <code className="text-[var(--accent)]">{caUrl}</code>
          </p>
        </div>
      </section>

      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}

      {loading ? (
        <Card padding="md">
          <Loader2 className="w-4 h-4 animate-spin inline-block" aria-hidden="true" />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {panels.map((p) => {
            const panelCerts = certsByRole.get(p.role) ?? [];
            const active = panelCerts.filter(
              (c) => !c.revokedAt && new Date(c.notAfter).getTime() > now,
            );
            return (
              <Card
                key={p.role}
                padding="md"
                className={
                  p.mtlsRequired
                    ? "border-green-500/30"
                    : "border-amber-500/40 bg-amber-500/5"
                }
              >
                <header className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-main)]">
                      {p.label}
                    </h3>
                    <a
                      href={`https://${p.domain}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
                    >
                      {p.domain} ↗
                    </a>
                  </div>
                  {p.mtlsRequired ? (
                    <Badge tone="success">
                      <Lock className="w-3 h-3" aria-hidden="true" />
                      mTLS wymagane
                    </Badge>
                  ) : (
                    <Badge tone="warning">
                      <Unlock className="w-3 h-3" aria-hidden="true" />
                      Otwarte (awaryjnie)
                    </Badge>
                  )}
                </header>

                <div className="mb-3 px-3 py-2 rounded-md bg-[var(--bg-main)] border border-[var(--border-subtle)]">
                  <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Aktywne certyfikaty
                  </div>
                  <div className="text-2xl font-bold text-[var(--text-main)]">
                    {active.length}
                    <span className="text-xs font-normal text-[var(--text-muted)] ml-2">
                      / {panelCerts.length} wystawionych
                    </span>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Posiadacze
                  </div>
                  {active.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">
                      Brak aktywnych certyfikatów.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {active.slice(0, 4).map((c) => {
                        const days = Math.max(
                          0,
                          Math.floor((new Date(c.notAfter).getTime() - now) / 86_400_000),
                        );
                        return (
                          <li
                            key={c.id}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="truncate">
                              <span className="text-[var(--text-main)]">{c.subject}</span>
                              <span className="text-[var(--text-muted)] ml-1">
                                ({c.email})
                              </span>
                            </span>
                            <Badge
                              tone={days < 30 ? "warning" : "neutral"}
                              className="text-[10px] whitespace-nowrap"
                            >
                              {days}d
                            </Badge>
                          </li>
                        );
                      })}
                      {active.length > 4 && (
                        <li className="text-xs text-[var(--text-muted)]">
                          +{active.length - 4} więcej…
                        </li>
                      )}
                    </ul>
                  )}
                </div>

                <Button
                  size="sm"
                  variant={p.mtlsRequired ? "secondary" : "primary"}
                  onClick={() => requestToggle(p.role, p.mtlsRequired)}
                  loading={pendingRole === p.role}
                  disabled={pendingRole !== null}
                  leftIcon={
                    p.mtlsRequired ? (
                      <ShieldAlert className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                    )
                  }
                  className={
                    p.mtlsRequired
                      ? "border-amber-500/40 text-amber-500 hover:bg-amber-500/10 w-full"
                      : "w-full"
                  }
                >
                  {p.mtlsRequired ? "Wyłącz wymóg awaryjnie" : "Włącz wymóg cert"}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-[var(--text-muted)]">
        Pełna konsola admina (wystawianie certyfikatów, audyt, revoke):{" "}
        <a href="/admin/certificates" className="text-[var(--accent)] hover:underline">
          /admin/certificates →
        </a>
      </p>

      <ReauthDialog
        open={!!reauthFor}
        targetRole={reauthFor?.role ?? null}
        nextValue={reauthFor?.nextValue ?? false}
        pending={reauthPending}
        error={reauthError}
        onClose={() => {
          setReauthFor(null);
          setReauthError(null);
        }}
        onConfirm={() => void performToggle()}
      />
    </PageShell>
  );
}

function ReauthDialog({
  open,
  targetRole,
  nextValue,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  targetRole: PanelRole | null;
  nextValue: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Potwierdź zmianę bezpieczeństwa"
      description={
        targetRole
          ? `${nextValue ? "Włączasz" : "Wyłączasz"} wymóg mTLS dla panelu "${targetRole}".`
          : ""
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Anuluj
          </Button>
          <Button
            onClick={onConfirm}
            loading={pending}
            leftIcon={<AlertTriangle className="w-4 h-4" aria-hidden="true" />}
          >
            Potwierdź i zaloguj się ponownie
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <Alert tone="warning">
        Ta operacja zmienia konfigurację bezpieczeństwa panelu. Po kliknięciu
        &bdquo;Potwierdź&rdquo; zostaniesz przekierowany na ekran logowania
        Keycloak (hasło lub Google) — po pomyślnej autentykacji akcja
        zostanie wykonana automatycznie i wrócisz tutaj.
        {nextValue
          ? " Po włączeniu panel ponownie wymaga certyfikatu klienckiego."
          : " Po wyłączeniu panel jest dostępny bez certyfikatu — używaj tylko awaryjnie."}
      </Alert>
    </Dialog>
  );
}
