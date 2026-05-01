"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Fingerprint,
  MapPin,
  Monitor,
  Radio,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { Alert, Badge, Button, Card, CardHeader } from "@/components/ui";
import type { IssuedCertificate } from "@/lib/step-ca";
import { CertLocationsDialog } from "@/app/admin/certificates/CertLocationsDialog";
import {
  EVENT_LABELS,
  summariseBinding,
  type BindingEventKind,
  type BindingEventRow,
  type DeviceBinding,
  type LiveBindingEvent,
} from "@/lib/services/certificates-service";
import { BindingDetails } from "./BindingEventsPanel";

/** Czy certyfikat jest "autoryzowany" — aktywny i ma przypisaną lokalizację */
function isAuthorized(c: IssuedCertificate): boolean {
  if (c.revokedAt) return false;
  const now = new Date();
  if (new Date(c.notAfter) < now) return false;
  if (!c.locationId) return false;
  return true;
}

/** Ile dni do wygaśnięcia (może być ujemne) */
function daysLeft(notAfter: string): number {
  return Math.floor((new Date(notAfter).getTime() - Date.now()) / 86_400_000);
}

/** Kolor progress bara i tekstu dla dni do wygaśnięcia */
function expiryColorClass(days: number): string {
  if (days < 0) return "bg-red-500";
  if (days < 30) return "bg-amber-400";
  return "bg-emerald-500";
}

function expiryTextClass(days: number): string {
  if (days < 0) return "text-red-400";
  if (days < 30) return "text-amber-400";
  return "text-emerald-400";
}

// ---------------------------------------------------------------------------
// Główny panel
// ---------------------------------------------------------------------------

export function CertListPanel({
  certs,
  onChange,
  lastEvent,
}: {
  certs: IssuedCertificate[];
  onChange: () => Promise<void>;
  lastEvent: LiveBindingEvent | null;
}) {
  const [revoking, setRevoking] = useState<string | null>(null);
  const [hiding, setHiding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assigningCert, setAssigningCert] = useState<IssuedCertificate | null>(null);
  const [authOpen, setAuthOpen] = useState(true);
  const [unauthOpen, setUnauthOpen] = useState(true);

  const authorized = certs.filter(isAuthorized);
  const unauthorized = certs.filter((c) => !isAuthorized(c));

  async function revoke(id: string) {
    if (!confirm("Unieważnić certyfikat? Operacja jest nieodwracalna.")) return;
    setError(null);
    setRevoking(id);
    try {
      const res = await fetch(`/api/admin/certificates/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się unieważnić certyfikatu");
    } finally {
      setRevoking(null);
    }
  }

  async function hide(id: string) {
    if (!confirm("Ukryć unieważniony certyfikat z listy? Pozostanie w audycie, ale zniknie z tego widoku.")) {
      return;
    }
    setError(null);
    setHiding(id);
    try {
      const res = await fetch(`/api/admin/certificates/${encodeURIComponent(id)}/hide`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się ukryć certyfikatu");
    } finally {
      setHiding(null);
    }
  }

  const sharedRowProps = {
    revoking,
    hiding,
    onRevoke: revoke,
    onHide: hide,
    onAssignLocations: setAssigningCert,
    lastEvent,
  };

  return (
    <Card padding="lg">
      <CardHeader
        icon={<ShieldCheck className="w-6 h-6 text-[var(--accent)]" />}
        title="Wydane certyfikaty urządzeń"
        description="Certyfikaty mTLS przypisane do stanowisk i lokalizacji. Autoryzowane = aktywne + mają przypisaną lokalizację."
      />
      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      {certs.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--text-muted)] text-center py-10">
          Brak wystawionych certyfikatów.
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {/* ---- Sekcja 1: Autoryzowane ---- */}
          <section>
            <button
              type="button"
              onClick={() => setAuthOpen((v) => !v)}
              className="flex items-center gap-2 w-full text-left mb-3 group"
            >
              {authOpen ? (
                <ChevronDown className="w-4 h-4 text-emerald-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-emerald-400" />
              )}
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-[var(--text-main)]">
                Autoryzowane urządzenia
              </span>
              <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-400">
                {authorized.length}
              </span>
            </button>
            {authOpen && (
              authorized.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] py-4 pl-6">
                  Brak autoryzowanych urządzeń. Wystaw certyfikat i przypisz lokalizację.
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {authorized.map((c) => (
                    <DeviceCard
                      key={c.id}
                      cert={c}
                      authorized
                      {...sharedRowProps}
                    />
                  ))}
                </div>
              )
            )}
          </section>

          {/* ---- Sekcja 2: Nieautoryzowane / Wygasłe ---- */}
          <section>
            <button
              type="button"
              onClick={() => setUnauthOpen((v) => !v)}
              className="flex items-center gap-2 w-full text-left mb-3"
            >
              {unauthOpen ? (
                <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
              )}
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-[var(--text-main)]">
                Nieautoryzowane / Wygasłe
              </span>
              <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-400">
                {unauthorized.length}
              </span>
            </button>
            {unauthOpen && (
              unauthorized.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] py-4 pl-6">
                  Brak nieautoryzowanych certyfikatów.
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {unauthorized.map((c) => (
                    <DeviceCard
                      key={c.id}
                      cert={c}
                      authorized={false}
                      {...sharedRowProps}
                    />
                  ))}
                </div>
              )
            )}
          </section>
        </div>
      )}

      {assigningCert && (
        <CertLocationsDialog
          open
          certId={assigningCert.id}
          certSubject={assigningCert.subject}
          certRoles={assigningCert.roles ?? (assigningCert.role ? [assigningCert.role] : [])}
          onClose={() => {
            setAssigningCert(null);
            void onChange();
          }}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Karta urządzenia
// ---------------------------------------------------------------------------

function DeviceCard({
  cert,
  authorized,
  revoking,
  hiding,
  onRevoke,
  onHide,
  onAssignLocations,
  lastEvent,
}: {
  cert: IssuedCertificate;
  authorized: boolean;
  revoking: string | null;
  hiding: string | null;
  onRevoke: (id: string) => void;
  onHide: (id: string) => void;
  onAssignLocations: (cert: IssuedCertificate) => void;
  lastEvent: LiveBindingEvent | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [binding, setBinding] = useState<DeviceBinding | null>(null);
  const [events, setEvents] = useState<BindingEventRow[]>([]);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [bindingLoading, setBindingLoading] = useState(false);
  const [bindingLoaded, setBindingLoaded] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [flashKind, setFlashKind] = useState<BindingEventKind | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBinding = useCallback(async () => {
    setBindingLoading(true);
    setBindingError(null);
    try {
      const res = await fetch(
        `/api/admin/certificates/${encodeURIComponent(cert.id)}/binding`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!res.ok) {
        const msg =
          res.status === 401 ? "Sesja wygasła — zaloguj się ponownie."
          : res.status === 403 ? "Brak uprawnień do tej operacji."
          : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const data = await res.json();
      setBinding((data.binding as DeviceBinding) ?? null);
      setEvents((data.events as BindingEventRow[]) ?? []);
      setBindingLoaded(true);
    } catch (err) {
      setBindingError(err instanceof Error ? err.message : "Nie udało się pobrać powiązania");
    } finally {
      setBindingLoading(false);
    }
  }, [cert.id]);

  useEffect(() => {
    if (expanded && !bindingLoaded && !bindingLoading && !bindingError) {
      void loadBinding();
    }
  }, [expanded, bindingLoaded, bindingLoading, bindingError, loadBinding]);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.serialNumber !== cert.serialNumber) return;
    setFlashKind(lastEvent.kind);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashKind(null), 6_000);
    void loadBinding();
  }, [lastEvent, cert.serialNumber, loadBinding]);

  useEffect(() => {
    if (!bindingLoaded && !bindingLoading) void loadBinding();
  }, [bindingLoaded, bindingLoading, loadBinding]);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  async function resetBinding() {
    if (!confirm("Zresetować powiązanie urządzenia? Kolejne użycie certyfikatu stworzy nowy odcisk.")) return;
    setResetting(true);
    try {
      const res = await fetch(
        `/api/admin/certificates/${encodeURIComponent(cert.id)}/binding`,
        { method: "DELETE", credentials: "same-origin", cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadBinding();
    } catch (err) {
      setBindingError(err instanceof Error ? err.message : "Nie udało się zresetować");
    } finally {
      setResetting(false);
    }
  }

  const bindingSummary = summariseBinding(binding);
  const days = daysLeft(cert.notAfter);
  const isExpired = !cert.revokedAt && days < 0;
  const isRevoked = !!cert.revokedAt;
  const hasNoLocation = !cert.locationId;

  const flashClass =
    flashKind === "denied" ? "ring-1 ring-red-400/50"
    : flashKind === "created" ? "ring-1 ring-emerald-400/50"
    : flashKind === "reset" ? "ring-1 ring-amber-400/50"
    : "";

  const cardBg = authorized
    ? "border-emerald-500/20 bg-[var(--bg-surface)]"
    : "border-[var(--border-subtle)] bg-[var(--bg-main)]/60";

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 transition-all ${cardBg} ${flashClass}`}
    >
      {/* Nagłówek karty */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Monitor
            className={`w-4 h-4 flex-shrink-0 ${authorized ? "text-emerald-400" : "text-[var(--text-muted)]"}`}
          />
          <span className="font-medium text-sm text-[var(--text-main)] truncate">
            {cert.subject}
          </span>
        </div>
        <div className="flex-shrink-0">
          {isRevoked ? (
            <Badge tone="danger">unieważniony</Badge>
          ) : isExpired ? (
            <Badge tone="danger">wygasły</Badge>
          ) : hasNoLocation ? (
            <Badge tone="warning">bez lokalizacji</Badge>
          ) : (
            <Badge tone="success">aktywny</Badge>
          )}
        </div>
      </div>

      {/* Rola + opis */}
      <div className="text-xs text-[var(--text-muted)] space-y-0.5">
        <div>
          <span className="uppercase tracking-wide font-medium">Rola:</span>{" "}
          {cert.role}
        </div>
        {cert.description && (
          <div>
            <span className="uppercase tracking-wide font-medium">Opis:</span>{" "}
            {cert.description}
          </div>
        )}
        {cert.email && (
          <div>
            <span className="uppercase tracking-wide font-medium">Kontakt:</span>{" "}
            {cert.email}
          </div>
        )}
      </div>

      {/* Progress bar do wygaśnięcia */}
      {!isRevoked && (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-[var(--text-muted)]">Ważność</span>
            <span className={expiryTextClass(days)}>
              {days < 0 ? `wygasł ${Math.abs(days)} dni temu` : `${days} dni`}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${expiryColorClass(days)}`}
              style={{ width: `${Math.max(0, Math.min(100, (days / 1095) * 100))}%` }}
            />
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            Wygasa: {new Date(cert.notAfter).toLocaleDateString("pl-PL")}
          </p>
        </div>
      )}

      {/* Badge powiązania + live event */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={bindingSummary.tone}>{bindingSummary.label}</Badge>
        {flashKind && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] animate-pulse ${
              flashKind === "denied" ? "text-red-300"
              : flashKind === "created" ? "text-emerald-300"
              : "text-amber-300"
            }`}
          >
            <Radio className="w-3 h-3" aria-hidden="true" />
            {EVENT_LABELS[flashKind]}
          </span>
        )}
      </div>

      {/* Przyciski akcji */}
      <div className="flex flex-wrap gap-1 pt-1 border-t border-[var(--border-subtle)]">
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Fingerprint className="w-3.5 h-3.5" />}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Ukryj szczegóły" : "Szczegóły"}
        </Button>
        {!cert.revokedAt && (
          <>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<MapPin className="w-3.5 h-3.5 text-sky-400" />}
              onClick={() => onAssignLocations(cert)}
              title="Przypisz lokalizację do urządzenia"
            >
              Lokalizacja
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={revoking === cert.id}
              leftIcon={<ShieldX className="w-3.5 h-3.5 text-red-500" />}
              onClick={() => onRevoke(cert.id)}
            >
              Unieważnij
            </Button>
          </>
        )}
        {cert.revokedAt && (
          <Button
            variant="ghost"
            size="sm"
            loading={hiding === cert.id}
            leftIcon={<EyeOff className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
            onClick={() => onHide(cert.id)}
          >
            Ukryj
          </Button>
        )}
      </div>

      {/* Expanded: binding details */}
      {expanded && (
        <div className="pt-2 border-t border-[var(--border-subtle)]">
          <BindingDetails
            binding={binding}
            events={events}
            loading={bindingLoading}
            error={bindingError}
            resetting={resetting}
            onReset={resetBinding}
          />
        </div>
      )}
    </div>
  );
}
