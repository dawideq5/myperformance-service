"use client";

import { useCallback, useEffect, useState } from "react";
import { Code2, Info } from "lucide-react";

import { Alert, Badge, Card } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";

import type {
  PostalCred,
  PostalDomainRow,
  PostalOrg,
  PostalServer,
} from "./types";

export function PostalPanel() {
  const [orgs, setOrgs] = useState<PostalOrg[]>([]);
  const [servers, setServers] = useState<PostalServer[]>([]);
  const [domains, setDomains] = useState<PostalDomainRow[]>([]);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selServer, setSelServer] = useState<number | null>(null);
  const [creds, setCreds] = useState<PostalCred[]>([]);

  const load = useCallback(async () => {
    try {
      const [o, s, d] = await Promise.all([
        api.get<{ organizations: PostalOrg[]; configured: boolean }>(
          "/api/admin/email/postal/organizations",
        ),
        api.get<{ servers: PostalServer[] }>("/api/admin/email/postal/servers"),
        api.get<{ domains: PostalDomainRow[] }>(
          "/api/admin/email/postal/domains",
        ),
      ]);
      setConfigured(o.configured);
      setOrgs(o.organizations);
      setServers(s.servers);
      setDomains(d.domains);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selServer == null) {
      setCreds([]);
      return;
    }
    void api
      .get<{ credentials: PostalCred[] }>(
        `/api/admin/email/postal/servers/${selServer}/credentials`,
      )
      .then((r) => setCreds(r.credentials));
  }, [selServer]);

  if (!configured) {
    return (
      <Alert tone="warning">
        POSTAL_DB_URL nie jest skonfigurowane. Skontaktuj admina infrastruktury.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex gap-3 items-start">
          <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-muted)]">
            Niskopoziomowe zarządzanie Postalem. Większość użytkowników nie
            potrzebuje tu zaglądać — zwykła konfiguracja SMTP jest w zakładce
            <strong> &bdquo;Konfiguracje SMTP&rdquo;</strong>. Tutaj tworzysz
            nowe organizacje, serwery, generujesz klucze SMTP/API.
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card padding="md">
        <h3 className="text-sm font-semibold mb-1">Domeny — status DNS</h3>
        <p className="text-[11px] text-[var(--text-muted)] mb-3">
          SPF i DKIM muszą być OK żeby maile docierały (deliverability). MX to
          gdzie kierowane są maile <strong>przychodzące</strong> — jeśli nasz
          Postal odbiera tylko outgoing (typowy setup), MX wskazuje na inne
          serwery i Postal pokazuje status <em>info</em> (nie błąd).
        </p>
        <div className="grid gap-2">
          {domains.map((d) => {
            const sendingOk = d.spfStatus === "OK" && d.dkimStatus === "OK";
            return (
              <div
                key={d.id}
                className="text-xs border border-[var(--border-subtle)] rounded-lg px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{d.name}</span>
                    {sendingOk && <Badge tone="success">wysyłka OK</Badge>}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Badge
                      tone={d.spfStatus === "OK" ? "success" : "warning"}
                      title="Sender Policy Framework — autoryzuje nasz Postal do wysyłania w imieniu domeny"
                    >
                      SPF: {d.spfStatus ?? "?"}
                    </Badge>
                    <Badge
                      tone={d.dkimStatus === "OK" ? "success" : "warning"}
                      title="DKIM — kryptograficzny podpis maila, krytyczny dla deliverability"
                    >
                      DKIM: {d.dkimStatus ?? "?"}
                    </Badge>
                    <Badge
                      tone={d.mxStatus === "OK" ? "success" : "neutral"}
                      title="MX — gdzie odbierane są maile przychodzące"
                    >
                      MX: {d.mxStatus ?? "?"}
                    </Badge>
                    <Badge
                      tone={
                        d.returnPathStatus === "OK" ? "success" : "warning"
                      }
                      title="Return-Path — adres bounces; wpływa na deliverability"
                    >
                      Return-Path: {d.returnPathStatus ?? "?"}
                    </Badge>
                  </div>
                </div>
                {!sendingOk && (
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                    SPF lub DKIM brakuje — to wymaga DODANIA brakujących
                    rekordów DNS w panelu domeny. Bez tego maile będą lądować w
                    spamie. Szczegóły rekordów (kopiuj-wklej):{" "}
                    <a
                      href="https://postal.myperformance.pl"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] hover:underline"
                    >
                      postal.myperformance.pl
                    </a>
                  </p>
                )}
                {sendingOk && d.mxStatus !== "OK" && (
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                    <strong>Wysyłka działa</strong> (SPF + DKIM OK). Status MX
                    wskazuje że <em>maile przychodzące</em> idą do innego
                    serwera (np. OVH, Google Workspace). To poprawne dla setupu
                    &bdquo;outgoing-only&rdquo;. Aby odbierać przez Postal —
                    zmień rekordy MX domeny aby wskazywały na ten serwer.
                  </p>
                )}
                {sendingOk && d.returnPathStatus !== "OK" && (
                  <p className="mt-2 text-[11px] text-amber-300">
                    <strong>Brak Return-Path:</strong> dodaj CNAME{" "}
                    <code className="bg-[var(--bg-main)] px-1 rounded">
                      psrp.{d.name}
                    </code>{" "}
                    →{" "}
                    <code className="bg-[var(--bg-main)] px-1 rounded">
                      psrp.postal.myperformance.pl
                    </code>{" "}
                    w DNS. Bez tego niektórzy odbiorcy (Gmail, Outlook) mogą
                    obniżać reputację — bounces nie wracają na właściwy adres.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card padding="md">
        <h3 className="text-sm font-semibold mb-3">Organizacje + serwery</h3>
        <div className="space-y-1.5">
          {orgs.map((o) => (
            <div key={o.id} className="text-xs">
              <div className="font-medium text-sm flex items-center gap-2">
                <Code2 className="w-3.5 h-3.5" /> {o.name}
                <Badge tone="neutral">{o.serverCount} serwer(y)</Badge>
              </div>
              <div className="ml-5 mt-1 space-y-1">
                {servers
                  .filter((s) => s.organizationId === o.id)
                  .map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setSelServer(selServer === s.id ? null : s.id)
                      }
                      className={`w-full text-left px-3 py-1.5 rounded-lg border ${selServer === s.id ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border-subtle)]"}`}
                    >
                      {s.name}{" "}
                      <span className="text-[var(--text-muted)]">
                        · {s.mode}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {selServer != null && (
        <Card padding="md">
          <h3 className="text-sm font-semibold mb-2">
            Skrzynki (klucze SMTP/API) na serwerze
          </h3>
          <div className="space-y-1.5">
            {creds.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between text-xs px-3 py-2 rounded bg-[var(--bg-main)]"
              >
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{c.type}</Badge>
                  <span className="font-mono">{c.name}</span>
                </div>
                <code
                  className="text-[10px] text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]"
                  onClick={() => navigator.clipboard.writeText(c.key)}
                  title="Kliknij aby skopiować pełny klucz"
                >
                  {c.key.slice(0, 12)}…{c.key.slice(-4)} (klik = kopiuj)
                </code>
              </div>
            ))}
            {creds.length === 0 && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Brak skrzynek na tym serwerze.
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
