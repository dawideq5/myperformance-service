"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  FileSignature,
  Mail,
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

  const refreshAll = useCallback(async () => {
    try {
      const [s, a, c] = await Promise.all([
        fetch("/api/admin/certificates/ca-status").then((r) => r.json()),
        fetch("/api/admin/certificates/audit").then((r) => r.json()),
        fetch("/api/admin/certificates").then((r) => r.json()),
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
      right={<CaStatusBadge status={caStatus} />}
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
            <ListPanel certs={certs} onChange={refreshAll} />
          </TabPanel>
          <TabPanel tabId="audit" active={tab === "audit"}>
            <AuditPanel audit={audit} />
          </TabPanel>
        </div>
      </div>
    </PageShell>
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
}: {
  certs: IssuedCertificate[];
  onChange: () => Promise<void>;
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
                <tr
                  key={c.id}
                  className="border-b border-[var(--border-subtle)]/50 hover:bg-[var(--bg-main)]/50"
                >
                  <td className="py-3 px-3 text-[var(--text-main)]">{c.subject}</td>
                  <td className="py-3 px-3 text-[var(--text-muted)]">{c.role}</td>
                  <td className="py-3 px-3 text-[var(--text-muted)]">{c.email}</td>
                  <td className="py-3 px-3 text-[var(--text-muted)]">
                    {new Date(c.notAfter).toLocaleDateString("pl-PL")}
                  </td>
                  <td className="py-3 px-3">
                    {c.revokedAt ? (
                      <Badge tone="danger">unieważniony</Badge>
                    ) : (
                      <Badge tone="success">aktywny</Badge>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {!c.revokedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={revoking === c.id}
                        leftIcon={<ShieldX className="w-4 h-4 text-red-500" />}
                        onClick={() => revoke(c.id)}
                      >
                        Unieważnij
                      </Button>
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
