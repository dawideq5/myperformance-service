"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Fingerprint,
  FileSignature,
  Mail,
  Radio,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Input,
  PageHeader,
  PageShell,
  TabPanel,
  Tabs,
  type TabDefinition,
} from "@/components/ui";
import type { IssuedCertificate } from "@/lib/step-ca";

type BindingEventKind = "created" | "seen" | "denied" | "reset";
interface LiveBindingEvent {
  kind: BindingEventKind;
  serialNumber: string;
  at: string;
  ip?: string;
  userAgent?: string;
  components?: Record<string, string>;
  diff?: { field: string; before: string; after: string }[];
  actor?: string;
}

type CaStatus = {
  online: boolean;
  url: string;
  provisioner?: string;
  provisionerType?: string;
  error?: string;
};
type AuditEvent = {
  ts: string;
  actor: string;
  action: string;
  subject?: string;
  ok: boolean;
  error?: string;
};

type CertTabId = "issue" | "list" | "audit";

const ROLES = [
  { value: "sprzedawca", label: "Sprzedawca" },
  { value: "serwisant", label: "Serwisant" },
  { value: "kierowca", label: "Kierowca" },
] as const;

const PRESETS = [30, 90, 365, 730, 1825];

interface IssueResult {
  sent: boolean;
  email: string;
  password: string;
  filename: string;
  notAfter: string;
  serial: string;
  error?: string;
  pkcs12Base64?: string;
}

export function CertificatesClient({ initialCerts }: { initialCerts: IssuedCertificate[] }) {
  const [tab, setTab] = useState<CertTabId>("issue");
  const [certs, setCerts] = useState(initialCerts);
  const [caStatus, setCaStatus] = useState<CaStatus | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<LiveBindingEvent | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);

  const refreshAll = useCallback(async () => {
    try {
      const init = { credentials: "same-origin" as const, cache: "no-store" as const };
      const [s, a, c] = await Promise.all([
        fetch("/api/admin/certificates/ca-status", init).then((r) => r.json()),
        fetch("/api/admin/certificates/audit", init).then((r) => r.json()),
        fetch("/api/admin/certificates", init).then((r) => r.json()),
      ]);
      setCaStatus(s);
      setAudit(a.events ?? []);
      setCerts(c.certificates ?? []);
    } catch {
      // swallowed — next poll will retry
    }
  }, []);

  useEffect(() => {
    void refreshAll();
    const iv = setInterval(refreshAll, 30000);
    return () => clearInterval(iv);
  }, [refreshAll]);

  useEffect(() => {
    const source = new EventSource("/api/admin/certificates/events", {
      withCredentials: true,
    });
    source.addEventListener("ready", () => setLiveConnected(true));
    source.addEventListener("binding", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as LiveBindingEvent;
        setLastEvent(data);
      } catch {
        // ignore malformed payload
      }
    });
    source.onerror = () => setLiveConnected(false);
    return () => source.close();
  }, []);

  const tabs: TabDefinition<CertTabId>[] = useMemo(
    () => [
      {
        id: "issue",
        label: "Wystaw",
        icon: <FileSignature className="w-5 h-5" />,
      },
      {
        id: "list",
        label: "Wydane",
        icon: <ShieldCheck className="w-5 h-5" />,
        badge:
          certs.length > 0 ? <Badge tone="neutral">{certs.length}</Badge> : undefined,
      },
      {
        id: "audit",
        label: "Audyt",
        icon: <Activity className="w-5 h-5" />,
      },
    ],
    [certs.length],
  );

  const header = (
    <PageHeader
      left={
        <>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            <span className="text-sm font-medium">Powrót</span>
          </Link>
          <div className="h-6 w-px bg-[var(--border-subtle)]" aria-hidden="true" />
          <h1 className="text-xl font-bold text-[var(--text-main)]">
            Certyfikaty klienckie
          </h1>
        </>
      }
      right={
        <div className="flex items-center gap-3">
          <LiveBadge connected={liveConnected} />
          <CaStatusBadge status={caStatus} />
        </div>
      }
    />
  );

  return (
    <PageShell maxWidth="xl" header={header}>
      <div className="grid lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1">
          <Tabs
            tabs={tabs}
            activeTab={tab}
            onChange={setTab}
            orientation="vertical"
            ariaLabel="Sekcje certyfikatów"
          />
        </aside>

        <div className="lg:col-span-3 space-y-6">
          <TabPanel tabId="issue" active={tab === "issue"}>
            <IssuePanel onIssued={refreshAll} />
          </TabPanel>
          <TabPanel tabId="list" active={tab === "list"}>
            <ListPanel
              certs={certs}
              onChange={refreshAll}
              lastEvent={lastEvent}
            />
          </TabPanel>
          <TabPanel tabId="audit" active={tab === "audit"}>
            <AuditPanel audit={audit} />
          </TabPanel>
        </div>
      </div>
    </PageShell>
  );
}

function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <div
      className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--text-muted)]"
      title={
        connected
          ? "Połączenie real-time — zdarzenia powiązań aktualizują się na żywo"
          : "Brak połączenia real-time — aktualizacje przychodzą co 30 s przez polling"
      }
    >
      <Radio
        className={`w-3 h-3 ${connected ? "text-emerald-400 animate-pulse" : "text-[var(--text-muted)]"}`}
        aria-hidden="true"
      />
      <span>{connected ? "LIVE" : "offline"}</span>
    </div>
  );
}

function CaStatusBadge({ status }: { status: CaStatus | null }) {
  if (!status) {
    return (
      <div className="hidden sm:flex items-center gap-2 text-xs text-[var(--text-muted)]">
        Sprawdzam CA…
      </div>
    );
  }
  return (
    <div className="hidden sm:flex items-center gap-2">
      <span
        className={`w-2 h-2 rounded-full ${status.online ? "bg-emerald-500" : "bg-red-500"}`}
        aria-hidden="true"
      />
      <span className="text-xs text-[var(--text-muted)]">
        CA{" "}
        {status.online ? (
          <span className="text-[var(--text-main)]">online</span>
        ) : (
          <span className="text-red-400">offline — {status.error ?? "nieznany błąd"}</span>
        )}
      </span>
    </div>
  );
}

function IssuePanel({ onIssued }: { onIssued: () => Promise<void> }) {
  const [commonName, setCommonName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>(["sprzedawca"]);
  const [validityDays, setValidityDays] = useState<number>(365);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IssueResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (roles.length === 0) {
      setError("Zaznacz co najmniej jedną rolę.");
      return;
    }
    if (!Number.isFinite(validityDays) || validityDays < 1 || validityDays > 3650) {
      setError("Ważność musi być w zakresie 1–3650 dni.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commonName, email, roles, validityDays }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

      setResult({
        sent: !!body.sent,
        email,
        password: body.password,
        filename: body.filename,
        notAfter: body.meta?.notAfter,
        serial: body.meta?.serialNumber,
        error: body.emailError,
        pkcs12Base64: body.pkcs12Base64,
      });

      setCommonName("");
      await onIssued();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nieznany błąd");
    } finally {
      setBusy(false);
    }
  }

  function downloadFallback() {
    if (!result?.pkcs12Base64) return;
    const bin = atob(result.pkcs12Base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/x-pkcs12" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Card padding="lg">
        <CardHeader
          icon={<FileSignature className="w-6 h-6 text-[var(--accent)]" />}
          title="Wystaw nowy certyfikat"
          description="Po wystawieniu plik .p12 trafi automatycznie na wskazany e-mail (noreply@myperformance.pl) wraz z hasłem i instrukcją instalacji Windows / macOS."
        />
        <form onSubmit={submit} className="grid md:grid-cols-2 gap-4 mt-6">
          <Input
            label="Imię i nazwisko (Common Name)"
            required
            placeholder="Jan Kowalski"
            value={commonName}
            onChange={(e) => setCommonName(e.target.value)}
          />
          <Input
            label="E-mail odbiorcy"
            required
            type="email"
            placeholder="jan@firma.pl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div>
            <Input
              label="Ważność (dni)"
              type="number"
              min={1}
              max={3650}
              required
              value={String(validityDays)}
              onChange={(e) => setValidityDays(Number(e.target.value))}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setValidityDays(d)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    validityDays === d
                      ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10"
                      : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  }`}
                >
                  {d === 365 ? "1 rok" : d === 730 ? "2 lata" : d === 1825 ? "5 lat" : `${d} dni`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text-muted)] mb-2">
              Role (panel dostępny z jednym certyfikatem)
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <Checkbox
                  key={r.value}
                  checked={roles.includes(r.value)}
                  onChange={(e) =>
                    setRoles((prev) =>
                      e.target.checked
                        ? Array.from(new Set([...prev, r.value]))
                        : prev.filter((x) => x !== r.value),
                    )
                  }
                  label={r.label}
                />
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <Button
              type="submit"
              loading={busy}
              leftIcon={<Mail className="w-4 h-4" />}
              fullWidth
            >
              Wystaw i wyślij na e-mail
            </Button>
          </div>
        </form>
        {error && (
          <Alert tone="error" className="mt-4">
            {error}
          </Alert>
        )}
      </Card>

      {result && (
        <Card padding="lg" className="border-emerald-500/30">
          <CardHeader
            icon={<ShieldCheck className="w-6 h-6 text-emerald-500" />}
            iconBgClassName="bg-emerald-500/10"
            title="Certyfikat wystawiony"
            description={
              result.sent
                ? `E-mail z certyfikatem i hasłem został wysłany na ${result.email}. Plik .p12 oraz hasło są też dostępne poniżej — pokaż je teraz, nie pojawią się ponownie.`
                : `Wysyłka e-mail nie powiodła się (${result.error ?? "nieznany błąd"}). Przekaż plik i hasło ręcznie — pobierz poniżej, bo po zamknięciu widoku nie będą dostępne.`
            }
          />
          <div className="mt-5 grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Hasło .p12
              </p>
              <p className="mt-1 font-mono text-[var(--text-main)] break-all">
                {result.password}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Numer seryjny
              </p>
              <p className="mt-1 font-mono text-[var(--text-main)] break-all">
                {result.serial}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigator.clipboard.writeText(result.password)}
            >
              Skopiuj hasło
            </Button>
            {result.pkcs12Base64 && (
              <Button variant="secondary" size="sm" onClick={downloadFallback}>
                Pobierz {result.filename}
              </Button>
            )}
          </div>
          {!result.sent && (
            <Alert tone="warning" className="mt-4">
              E-mail nie dotarł — {result.error ?? "sprawdź logi SMTP"}. Pobierz
              plik i przekaż hasło innym kanałem.
            </Alert>
          )}
        </Card>
      )}
    </div>
  );
}

function ListPanel({
  certs,
  onChange,
  lastEvent,
}: {
  certs: IssuedCertificate[];
  onChange: () => Promise<void>;
  lastEvent: LiveBindingEvent | null;
}) {
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
                  onRevoke={() => revoke(c.id)}
                  lastEvent={lastEvent}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

interface DeviceBinding {
  serialNumber: string;
  hash: string;
  components: Record<string, string>;
  firstSeenAt: string;
  lastSeenAt: string;
  lastDeniedAt?: string;
  lastDenial?: {
    at: string;
    ip?: string;
    userAgent?: string;
    diff: { field: string; before: string; after: string }[];
  };
}

interface BindingEventRow {
  id: string;
  ts: string;
  kind: BindingEventKind;
  ip?: string;
  userAgent?: string;
  components?: Record<string, string>;
  diff?: { field: string; before: string; after: string }[];
  actor?: string;
}

const BINDING_FIELD_LABELS: Record<string, string> = {
  userAgent: "Przeglądarka (User-Agent)",
  platform: "System operacyjny",
  browserBrand: "Rodzaj przeglądarki",
  acceptLanguage: "Preferowany język",
  mobile: "Tryb mobilny",
};

const EVENT_LABELS: Record<BindingEventKind, string> = {
  created: "Powiązanie utworzone",
  seen: "Użycie",
  denied: "Próba z innego urządzenia odrzucona",
  reset: "Powiązanie zresetowane",
};

function eventTone(
  kind: BindingEventKind,
): "success" | "danger" | "neutral" | "warning" {
  switch (kind) {
    case "created":
      return "success";
    case "denied":
      return "danger";
    case "reset":
      return "warning";
    default:
      return "neutral";
  }
}

function summariseBinding(
  binding: DeviceBinding | null,
): { label: string; tone: "success" | "danger" | "neutral"; hint?: string } {
  if (!binding) {
    return {
      label: "Niepowiązany",
      tone: "neutral",
      hint: "Certyfikat jeszcze nie został użyty — pierwsze poprawne użycie utworzy odcisk urządzenia.",
    };
  }
  if (binding.lastDeniedAt) {
    return {
      label: "Powiązany + próby obce",
      tone: "danger",
      hint: `Ostatnia próba z innego urządzenia: ${new Date(binding.lastDeniedAt).toLocaleString("pl-PL")}`,
    };
  }
  return {
    label: "Powiązany",
    tone: "success",
    hint: `Ostatnie użycie: ${new Date(binding.lastSeenAt).toLocaleString("pl-PL")}`,
  };
}

function CertRow({
  cert,
  revoking,
  onRevoke,
  lastEvent,
}: {
  cert: IssuedCertificate;
  revoking: boolean;
  onRevoke: () => void;
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
        <td className="py-3 px-3 text-right">
          {!cert.revokedAt && (
            <Button
              variant="ghost"
              size="sm"
              loading={revoking}
              leftIcon={<ShieldX className="w-4 h-4 text-red-500" />}
              onClick={onRevoke}
            >
              Unieważnij
            </Button>
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

function BindingDetails({
  binding,
  events,
  loading,
  error,
  resetting,
  onReset,
}: {
  binding: DeviceBinding | null;
  events: BindingEventRow[];
  loading: boolean;
  error: string | null;
  resetting: boolean;
  onReset: () => void;
}) {
  if (loading && !binding) {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        Ładowanie powiązania urządzenia…
      </p>
    );
  }
  if (error) return <Alert tone="error">{error}</Alert>;

  const denialEvents = events.filter((e) => e.kind === "denied");

  return (
    <div className="space-y-4">
      {binding ? (
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)]/60 p-4">
          <header className="flex items-center gap-2 text-sm text-[var(--text-main)] mb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span className="font-medium">Powiązane urządzenie</span>
            <Badge tone={binding.lastDeniedAt ? "danger" : "success"}>
              {binding.lastDeniedAt ? "są próby obce" : "stabilne"}
            </Badge>
          </header>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            <BindingField
              label="Pierwsze użycie"
              value={new Date(binding.firstSeenAt).toLocaleString("pl-PL")}
            />
            <BindingField
              label="Ostatnie użycie"
              value={new Date(binding.lastSeenAt).toLocaleString("pl-PL")}
            />
            {Object.entries(binding.components).map(([k, v]) => (
              <BindingField
                key={k}
                label={BINDING_FIELD_LABELS[k] ?? k}
                value={v || "—"}
                truncate
              />
            ))}
          </dl>
          <div className="mt-4 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RotateCcw className="w-4 h-4" aria-hidden="true" />}
              loading={resetting}
              onClick={onReset}
            >
              Zresetuj powiązanie
            </Button>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)]/60 p-4">
          <p className="text-xs text-[var(--text-muted)]">
            Brak powiązanego urządzenia. Certyfikat jeszcze nie został użyty —
            pierwsze poprawne użycie utworzy odcisk urządzenia. Status
            zaktualizuje się automatycznie, gdy to nastąpi.
          </p>
        </section>
      )}

      {denialEvents.length > 0 && (
        <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <header className="flex items-center gap-2 text-sm text-red-200 mb-3">
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            <span className="font-medium">
              Próby powiązania z innych urządzeń
            </span>
            <Badge tone="danger">{denialEvents.length}</Badge>
          </header>
          <ul className="space-y-2">
            {denialEvents.slice(0, 10).map((ev) => (
              <li
                key={ev.id}
                className="text-xs border-l border-red-500/40 pl-3 py-1"
              >
                <p className="text-red-200 font-mono">
                  {new Date(ev.ts).toLocaleString("pl-PL")}
                  {ev.ip ? ` • ${ev.ip}` : ""}
                </p>
                {ev.diff && ev.diff.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {ev.diff.map((d) => (
                      <li key={d.field} className="text-[var(--text-muted)]">
                        <span className="text-[var(--text-main)]">
                          {BINDING_FIELD_LABELS[d.field] ?? d.field}:
                        </span>{" "}
                        <span className="text-red-300">„{d.after}"</span>{" "}
                        zamiast{" "}
                        <span className="text-emerald-300">„{d.before}"</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {denialEvents.length > 10 && (
            <p className="text-[11px] text-[var(--text-muted)] mt-2">
              Pokazano 10 najnowszych z {denialEvents.length}.
            </p>
          )}
        </section>
      )}

      {events.length > 0 && (
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)]/40 p-4">
          <header className="flex items-center gap-2 text-sm text-[var(--text-muted)] mb-3">
            <Activity className="w-4 h-4" aria-hidden="true" />
            <span className="font-medium">Oś czasu zdarzeń</span>
            <Badge tone="neutral">{events.length}</Badge>
          </header>
          <ul className="space-y-1.5 text-xs">
            {events.slice(0, 20).map((ev) => (
              <li
                key={ev.id}
                className="flex items-start gap-2 text-[var(--text-muted)]"
              >
                <Badge tone={eventTone(ev.kind)}>
                  {EVENT_LABELS[ev.kind]}
                </Badge>
                <span className="font-mono whitespace-nowrap">
                  {new Date(ev.ts).toLocaleString("pl-PL")}
                </span>
                {ev.ip && <span>• {ev.ip}</span>}
                {ev.actor && <span>• {ev.actor}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BindingField({
  label,
  value,
  truncate,
}: {
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd
        className={`text-[var(--text-main)] ${truncate ? "truncate" : ""}`}
        title={truncate ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

function AuditPanel({ audit }: { audit: AuditEvent[] }) {
  return (
    <Card padding="lg">
      <CardHeader
        icon={<Activity className="w-6 h-6 text-[var(--accent)]" />}
        title="Dziennik audytu"
        description="Ostatnie zdarzenia wystawień, wysyłek e-mail i unieważnień."
      />
      {audit.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--text-muted)] text-center py-10">
          Brak zdarzeń.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border-subtle)]">
                <th className="py-2 px-3 font-medium">Czas</th>
                <th className="py-2 px-3 font-medium">Admin</th>
                <th className="py-2 px-3 font-medium">Akcja</th>
                <th className="py-2 px-3 font-medium">Subject</th>
                <th className="py-2 px-3 font-medium">Wynik</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((e, idx) => (
                <tr key={idx} className="border-b border-[var(--border-subtle)]/50">
                  <td className="py-2 px-3 text-[var(--text-muted)] font-mono whitespace-nowrap">
                    {new Date(e.ts).toLocaleString("pl-PL")}
                  </td>
                  <td className="py-2 px-3 text-[var(--text-muted)]">{e.actor}</td>
                  <td className="py-2 px-3 text-[var(--text-main)]">{e.action}</td>
                  <td className="py-2 px-3 text-[var(--text-muted)]">
                    {e.subject ?? "—"}
                  </td>
                  <td className="py-2 px-3">
                    {e.ok ? (
                      <Badge tone="success">ok</Badge>
                    ) : (
                      <Badge tone="danger" title={e.error}>
                        błąd
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
