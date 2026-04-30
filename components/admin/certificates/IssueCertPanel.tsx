"use client";

import { useState } from "react";
import { FileSignature, Mail, ShieldCheck } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Input,
} from "@/components/ui";
import {
  PRESETS,
  ROLES,
  pkcs12ToBlobUrl,
  validateIssueInput,
  type IssueResult,
} from "@/lib/services/certificates-service";

export function IssueCertPanel({
  onIssued,
}: {
  onIssued: () => Promise<void>;
}) {
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
    const validationError = validateIssueInput({ roles, validityDays });
    if (validationError) {
      setError(validationError);
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
    const { url } = pkcs12ToBlobUrl(result.pkcs12Base64);
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
