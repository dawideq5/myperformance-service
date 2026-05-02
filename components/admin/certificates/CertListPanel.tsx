"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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

/** Klasyfikacja statusu certyfikatu — używana do badge i filtra. */
type CertStatus = "active" | "expired" | "revoked";

function classify(c: IssuedCertificate): CertStatus {
  if (c.revokedAt) return "revoked";
  if (new Date(c.notAfter) < new Date()) return "expired";
  return "active";
}

const STATUS_LABEL: Record<CertStatus, string> = {
  active: "autoryzowany",
  expired: "wygasły",
  revoked: "unieważniony",
};

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
  // Flat-list controls — admin chce jedną listę z filtrem statusu i sortowaniem
  // (poprzedni podział na "Autoryzowane" / "Nieautoryzowane" mylił, bo czasem
  // cert był aktywny ale bez lokalizacji = nieautoryzowany; admin tracił
  // kontekst).
  const [filter, setFilter] = useState<"all" | CertStatus>("all");
  const [sort, setSort] = useState<"newest" | "expiry" | "name">("newest");

  const filtered = useMemo(() => {
    const list = filter === "all" ? certs : certs.filter((c) => classify(c) === filter);
    const sorted = [...list];
    if (sort === "newest") {
      sorted.sort((a, b) => {
        const tA = new Date(a.notAfter).getTime();
        const tB = new Date(b.notAfter).getTime();
        return tB - tA;
      });
    } else if (sort === "expiry") {
      sorted.sort(
        (a, b) =>
          new Date(a.notAfter).getTime() - new Date(b.notAfter).getTime(),
      );
    } else {
      sorted.sort((a, b) => a.subject.localeCompare(b.subject));
    }
    return sorted;
  }, [certs, filter, sort]);

  const counts = useMemo(() => {
    const c: Record<CertStatus | "all", number> = {
      all: certs.length,
      active: 0,
      expired: 0,
      revoked: 0,
    };
    for (const cert of certs) c[classify(cert)] += 1;
    return c;
  }, [certs]);

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
        <div className="mt-5 space-y-4">
          {/* ---- Filtr + sort (jedna lista, bez podziału na sekcje) ---- */}
          <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["all", "Wszystkie"],
                  ["active", STATUS_LABEL.active],
                  ["expired", STATUS_LABEL.expired],
                  ["revoked", STATUS_LABEL.revoked],
                ] as Array<[typeof filter, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    filter === key
                      ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10"
                      : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  }`}
                >
                  {label}
                  <span className="ml-1 opacity-70">({counts[key]})</span>
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-[11px] text-[var(--text-muted)]">Sortuj:</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="text-[11px] px-2 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-main)]"
              >
                <option value="newest">Najnowsze</option>
                <option value="expiry">Najbliżej wygaśnięcia</option>
                <option value="name">Nazwa A-Z</option>
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-6 text-center">
              Brak certyfikatów pasujących do filtra.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {filtered.map((c) => (
                <DeviceCard key={c.id} cert={c} {...sharedRowProps} />
              ))}
            </div>
          )}
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
  revoking,
  hiding,
  onRevoke,
  onHide,
  onAssignLocations,
  lastEvent,
}: {
  cert: IssuedCertificate;
  revoking: string | null;
  hiding: string | null;
  onRevoke: (id: string) => void;
  onHide: (id: string) => void;
  onAssignLocations: (cert: IssuedCertificate) => void;
  lastEvent: LiveBindingEvent | null;
}) {
  const status = classify(cert);
  const authorized = status === "active";
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
