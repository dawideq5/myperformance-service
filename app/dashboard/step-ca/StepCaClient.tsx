"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Download, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button, Card, PageShell } from "@/components/ui";

interface Props {
  caUrl: string;
  rootFingerprint: string | null;
}

export function StepCaClient({ caUrl, rootFingerprint }: Props) {
  const rootUrl = `${caUrl.replace(/\/$/, "")}/roots.pem`;
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const bootstrap = rootFingerprint
    ? `step ca bootstrap --ca-url ${caUrl} --fingerprint ${rootFingerprint}`
    : `step ca bootstrap --ca-url ${caUrl} --fingerprint <wartość-fingerprint>`;

  const issue = `step ca certificate "user@myperformance.pl" user.crt user.key \\\n  --provisioner keycloak --provisioner-password-file /dev/null`;

  return (
    <PageShell maxWidth="lg" header={<AppHeader userLabel="" userSubLabel="" />}>
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Wróć do dashboardu
        </Link>
      </div>

      <header className="mb-8 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-7 h-7 text-teal-500" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-main)]">Step CA</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Publiczny endpoint <code className="text-[var(--accent)]">{caUrl}</code>{" "}
            nie udostępnia UI — to serwer PKI wystawiający certyfikaty przez API.
            Poniżej znajdziesz instrukcje self-service oraz pliki startowe dla klienta{" "}
            <code>step</code>.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4">
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            1. Pobierz root CA
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Root certificate używany do weryfikacji wszystkich usług wewnętrznych.
            Pobierz go i zaimportuj do systemowego trust store albo użyj do bootstrapu
            klienta <code>step</code>.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              leftIcon={<Download className="w-4 h-4" aria-hidden="true" />}
              onClick={() => {
                window.open(rootUrl, "_blank", "noopener,noreferrer");
              }}
            >
              Pobierz roots.pem
            </Button>
            <Button
              variant="secondary"
              leftIcon={<Copy className="w-4 h-4" aria-hidden="true" />}
              onClick={() => copy(rootUrl, "root")}
            >
              {copied === "root" ? "Skopiowano" : "Skopiuj URL"}
            </Button>
          </div>
          {rootFingerprint ? (
            <div className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-main)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-[var(--text-muted)]">SHA-256 fingerprint</div>
                <button
                  type="button"
                  className="text-xs text-[var(--accent)] hover:underline"
                  onClick={() => copy(rootFingerprint, "fp")}
                >
                  {copied === "fp" ? "Skopiowano" : "Kopiuj"}
                </button>
              </div>
              <code className="mt-1 block break-all text-xs text-[var(--text-main)]">
                {rootFingerprint}
              </code>
            </div>
          ) : (
            <p className="mt-4 text-xs text-amber-500">
              Nie udało się pobrać root cert z {rootUrl}. Zweryfikuj konfigurację
              STEP_CA_URL na serwerze.
            </p>
          )}
        </Card>

        <Card padding="lg">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            2. Bootstrap klienta step
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Jednorazowy setup lokalny — ustawia root CA i adres urzędu.
          </p>
          <pre className="mt-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-subtle)] p-3 text-xs overflow-x-auto text-[var(--text-main)]">
            {bootstrap}
          </pre>
          <div className="mt-2">
            <button
              type="button"
              className="text-xs text-[var(--accent)] hover:underline"
              onClick={() => copy(bootstrap, "bootstrap")}
            >
              {copied === "bootstrap" ? "Skopiowano" : "Kopiuj polecenie"}
            </button>
          </div>
        </Card>

        <Card padding="lg">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            3. Wystaw certyfikat przez Keycloak (OIDC)
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Prowizjoner <code>keycloak</code> używa Twojej tożsamości Keycloak —
            przy wywołaniu otworzy się okno logowania. Certyfikat ważny 12 miesięcy.
          </p>
          <pre className="mt-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-subtle)] p-3 text-xs overflow-x-auto text-[var(--text-main)]">
            {issue}
          </pre>
          <div className="mt-2">
            <button
              type="button"
              className="text-xs text-[var(--accent)] hover:underline"
              onClick={() => copy(issue, "issue")}
            >
              {copied === "issue" ? "Skopiowano" : "Kopiuj polecenie"}
            </button>
          </div>
        </Card>

        <Card padding="lg">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            Szybki dostęp
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link
                href="/admin/certificates"
                className="text-[var(--accent)] hover:underline"
              >
                → Certyfikaty klienckie mTLS (admin)
              </Link>
            </li>
            <li>
              <a
                className="text-[var(--accent)] hover:underline"
                href={`${caUrl.replace(/\/$/, "")}/health`}
                target="_blank"
                rel="noopener noreferrer"
              >
                → /health (status step-ca)
              </a>
            </li>
            <li>
              <a
                className="text-[var(--accent)] hover:underline"
                href="https://smallstep.com/docs/step-cli/reference/"
                target="_blank"
                rel="noopener noreferrer"
              >
                → Dokumentacja step CLI
              </a>
            </li>
          </ul>
        </Card>
      </div>
    </PageShell>
  );
}
