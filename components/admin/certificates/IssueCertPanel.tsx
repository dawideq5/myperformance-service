"use client";

import { useEffect, useState } from "react";
import { FileSignature, Monitor, ShieldCheck } from "lucide-react";
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
import type { Location } from "@/lib/locations";

/** Etykiety presetów ważności. */
function presetLabel(days: number): string {
  if (days === 30) return "30 dni";
  if (days === 90) return "90 dni";
  if (days === 365) return "1 rok";
  if (days === 1095) return "3 lata";
  return `${days} dni`;
}

export function IssueCertPanel({
  onIssued,
}: {
  onIssued: () => Promise<void>;
}) {
  // Formularz — model urządzenie-lokalizacja
  const [deviceName, setDeviceName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>(["sprzedawca"]);
  const [validityDays, setValidityDays] = useState<number>(365);

  const [locations, setLocations] = useState<Location[]>([]);
  const [locLoading, setLocLoading] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IssueResult | null>(null);

  // Pobierz listę lokalizacji
  useEffect(() => {
    setLocLoading(true);
    fetch("/api/locations", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { locations: Location[] }) => setLocations(data.locations ?? []))
      .catch(() => setLocations([]))
      .finally(() => setLocLoading(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!deviceName.trim()) {
      setError("Wpisz nazwę urządzenia.");
      return;
    }
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
        body: JSON.stringify({
          deviceName: deviceName.trim(),
          locationId: locationId || undefined,
          description: description.trim() || undefined,
          email: email.trim() || undefined,
          roles,
          validityDays,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

      setResult({
        sent: !!body.sent,
        deviceName: deviceName.trim(),
        email: email.trim(),
        password: body.password,
        filename: body.filename,
        notAfter: body.meta?.notAfter,
        serial: body.meta?.serialNumber,
        error: body.emailError,
        pkcs12Base64: body.pkcs12Base64,
      });

      setDeviceName("");
      setLocationId("");
      setDescription("");
      setEmail("");
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
          title="Wystaw certyfikat dla urządzenia"
          description="Certyfikat jest przypisany do komputera/stanowiska — nie do konkretnej osoby. Wszyscy pracownicy przypisanej lokalizacji korzystają z tego samego certyfikatu urządzenia."
        />
        <form onSubmit={submit} className="grid md:grid-cols-2 gap-4 mt-6">
          {/* Nazwa urządzenia (CN) */}
          <Input
            label="Nazwa urządzenia / komputera (CN)"
            required
            placeholder="PC-SERWIS-01"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
          />

          {/* Lokalizacja */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text-muted)]">
              Lokalizacja
            </label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
              disabled={locLoading}
            >
              <option value="">— wybierz lokalizację (opcjonalne) —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.address ? ` · ${l.address}` : ""}
                </option>
              ))}
            </select>
            {locLoading && (
              <p className="text-xs text-[var(--text-muted)]">Ładowanie lokalizacji…</p>
            )}
          </div>

          {/* Rola panelu */}
          <div>
            <p className="text-sm font-medium text-[var(--text-muted)] mb-2">
              Rola panelu
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

          {/* Ważność */}
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
                  {presetLabel(d)}
                </button>
              ))}
            </div>
          </div>

          {/* Opis (opcjonalne) */}
          <Input
            label="Opis stanowiska (opcjonalne)"
            placeholder="np. Stanowisko w serwisie, sekcja przyjęć"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* E-mail dostarczenia (opcjonalne) */}
          <Input
            label="E-mail dostarczenia .p12 (opcjonalne)"
            type="email"
            placeholder="kierownik@firma.pl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <div className="md:col-span-2">
            <Button
              type="submit"
              loading={busy}
              leftIcon={<Monitor className="w-4 h-4" />}
              fullWidth
            >
              Wystaw certyfikat dla urządzenia
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
              result.sent && result.email
                ? `E-mail z certyfikatem i hasłem został wysłany na ${result.email}. Plik .p12 oraz hasło są też dostępne poniżej — pokaż je teraz, nie pojawią się ponownie.`
                : result.email
                  ? `Wysyłka e-mail nie powiodła się (${result.error ?? "nieznany błąd"}). Pobierz plik i przekaż hasło ręcznie — po zamknięciu widoku nie będą dostępne.`
                  : `Certyfikat wystawiony dla urządzenia ${result.deviceName}. Pobierz plik .p12 i przekaż go ręcznie — hasło i plik są dostępne tylko teraz.`
            }
          />
          <div className="mt-5 grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Urządzenie
              </p>
              <p className="mt-1 font-mono text-[var(--text-main)]">
                {result.deviceName}
              </p>
            </div>
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
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Ważny do
              </p>
              <p className="mt-1 text-[var(--text-main)]">
                {result.notAfter
                  ? new Date(result.notAfter).toLocaleDateString("pl-PL")
                  : "—"}
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
          {result.email && !result.sent && (
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
