"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EyeOff,
  Fingerprint,
  MapPin,
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
  const [assigningCert, setAssigningCert] = useState<IssuedCertificate | null>(
    null,
  );

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
    if (
      !confirm(
        "Ukryć unieważniony certyfikat z listy? Pozostanie w audycie, ale zniknie z tego widoku.",
      )
    ) {
      return;
    }
    setError(null);
    setHiding(id);
    try {
      const res = await fetch(
        `/api/admin/certificates/${encodeURIComponent(id)}/hide`,
        { method: "POST" },
      );
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

  return (
    <Card padding="lg">
      <CardHeader
        icon={<ShieldCheck className="w-6 h-6 text-[var(--accent)]" />}
        title="Wydane certyfikaty"
        description="Wszystkie certyfikaty wystawione przez wewnętrzną CA."
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
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border-subtle)]">
                <th className="py-3 px-3 font-medium">Subject</th>
                <th className="py-3 px-3 font-medium">Role</th>
                <th className="py-3 px-3 font-medium">E-mail</th>
                <th className="py-3 px-3 font-medium">Ważny do</th>
                <th className="py-3 px-3 font-medium">Status</th>
                <th className="py-3 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {certs.map((c) => (
                <CertRow
                  key={c.id}
                  cert={c}
                  revoking={revoking === c.id}
                  hiding={hiding === c.id}
                  onRevoke={() => revoke(c.id)}
                  onHide={() => hide(c.id)}
                  onAssignLocations={() => setAssigningCert(c)}
                  lastEvent={lastEvent}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {assigningCert && (
        <CertLocationsDialog
          open
          certId={assigningCert.id}
          certSubject={assigningCert.subject}
          certRoles={assigningCert.roles ?? (assigningCert.role ? [assigningCert.role] : [])}
          onClose={() => setAssigningCert(null)}
        />
      )}
    </Card>
  );
}

function CertRow({
  cert,
  revoking,
  hiding,
  onRevoke,
  onHide,
  onAssignLocations,
  lastEvent,
}: {
  cert: IssuedCertificate;
  revoking: boolean;
  hiding: boolean;
  onRevoke: () => void;
  onHide: () => void;
  onAssignLocations: () => void;
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
          res.status === 401
            ? "Sesja wygasła — zaloguj się ponownie."
            : res.status === 403
              ? "Brak uprawnień do tej operacji."
              : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const data = await res.json();
      setBinding((data.binding as DeviceBinding) ?? null);
      setEvents((data.events as BindingEventRow[]) ?? []);
      setBindingLoaded(true);
    } catch (err) {
      setBindingError(
        err instanceof Error ? err.message : "Nie udało się pobrać powiązania",
      );
    } finally {
      setBindingLoading(false);
    }
  }, [cert.id]);

  useEffect(() => {
    if (expanded && !bindingLoaded && !bindingLoading && !bindingError) {
      void loadBinding();
    }
  }, [expanded, bindingLoaded, bindingLoading, bindingError, loadBinding]);

  // React to live SSE events for THIS cert's serial.
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.serialNumber !== cert.serialNumber) return;

    setFlashKind(lastEvent.kind);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashKind(null), 6_000);

    // Trigger a refetch whether or not the row is expanded — the compact
    // row badge also reflects live binding status.
    void loadBinding();
  }, [lastEvent, cert.serialNumber, loadBinding]);

  // First fetch: mount-time, so the collapsed status badge works without expand.
  useEffect(() => {
    if (!bindingLoaded && !bindingLoading) void loadBinding();
  }, [bindingLoaded, bindingLoading, loadBinding]);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  async function resetBinding() {
    if (
      !confirm(
        "Zresetować powiązanie urządzenia? Kolejne użycie certyfikatu stworzy nowy odcisk.",
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch(
        `/api/admin/certificates/${encodeURIComponent(cert.id)}/binding`,
        { method: "DELETE", credentials: "same-origin", cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadBinding();
    } catch (err) {
      setBindingError(
        err instanceof Error ? err.message : "Nie udało się zresetować",
      );
    } finally {
      setResetting(false);
    }
  }

  const bindingSummary = summariseBinding(binding);
  const flashClass =
    flashKind === "denied"
      ? "ring-1 ring-red-400/50 bg-red-500/5"
      : flashKind === "created"
        ? "ring-1 ring-emerald-400/50 bg-emerald-500/5"
        : flashKind === "reset"
          ? "ring-1 ring-amber-400/50 bg-amber-500/5"
          : "";

  return (
    <>
      <tr
        className={`border-b border-[var(--border-subtle)]/50 hover:bg-[var(--bg-main)]/50 transition-all ${flashClass}`}
      >
        <td className="py-3 px-3 text-[var(--text-main)]">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2 hover:text-[var(--accent)]"
          >
            <Fingerprint
              className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
            <span>{cert.subject}</span>
          </button>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <Badge tone={bindingSummary.tone}>
              {bindingSummary.label}
            </Badge>
            {flashKind && (
              <span
                className={`inline-flex items-center gap-1 ${
                  flashKind === "denied"
                    ? "text-red-300"
                    : flashKind === "created"
                      ? "text-emerald-300"
                      : "text-amber-300"
                } animate-pulse`}
                title="Zdarzenie odebrane z cert-gate w czasie rzeczywistym"
              >
                <Radio className="w-3 h-3" aria-hidden="true" />
                {EVENT_LABELS[flashKind]}
              </span>
            )}
          </div>
        </td>
        <td className="py-3 px-3 text-[var(--text-muted)]">{cert.role}</td>
        <td className="py-3 px-3 text-[var(--text-muted)]">{cert.email}</td>
        <td className="py-3 px-3 text-[var(--text-muted)]">
          {new Date(cert.notAfter).toLocaleDateString("pl-PL")}
        </td>
        <td className="py-3 px-3">
          {cert.revokedAt ? (
            <Badge tone="danger">unieważniony</Badge>
          ) : (
            <Badge tone="success">aktywny</Badge>
          )}
        </td>
        <td className="py-3 px-3 text-right whitespace-nowrap">
          {cert.revokedAt ? (
            <Button
              variant="ghost"
              size="sm"
              loading={hiding}
              leftIcon={<EyeOff className="w-4 h-4 text-[var(--text-muted)]" />}
              onClick={onHide}
            >
              Ukryj
            </Button>
          ) : (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<MapPin className="w-4 h-4 text-sky-400" />}
                onClick={onAssignLocations}
                title="Przypisz punkty do certyfikatu"
              >
                Punkty
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={revoking}
                leftIcon={<ShieldX className="w-4 h-4 text-red-500" />}
                onClick={onRevoke}
              >
                Unieważnij
              </Button>
            </div>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-[var(--border-subtle)]/50 bg-[var(--bg-main)]/40">
          <td colSpan={6} className="py-4 px-3">
            <BindingDetails
              binding={binding}
              events={events}
              loading={bindingLoading}
              error={bindingError}
              resetting={resetting}
              onReset={resetBinding}
            />
          </td>
        </tr>
      )}
    </>
  );
}
