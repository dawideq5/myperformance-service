"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  FileSignature,
  Radio,
  ShieldCheck,
} from "lucide-react";

import {
  Badge,
  OnboardingCard,
  PageShell,
  TabPanel,
  Tabs,
  type TabDefinition,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import type { IssuedCertificate } from "@/lib/step-ca";
import {
  rootExpiryColorClass,
  type AuditEvent,
  type CaStatus,
  type LiveBindingEvent,
} from "@/lib/services/certificates-service";
import { IssueCertPanel } from "@/components/admin/certificates/IssueCertPanel";
import { CertListPanel } from "@/components/admin/certificates/CertListPanel";
import { AuditLogPanel } from "@/components/admin/certificates/AuditLogPanel";
import { ServicesPanel } from "@/components/admin/certificates/ServicesPanel";

type CertTabId = "services" | "issue" | "list" | "audit";

export function CertificatesClient({
  initialCerts,
  userLabel,
  userEmail,
}: {
  initialCerts: IssuedCertificate[];
  userLabel?: string;
  userEmail?: string;
}) {
  const [tab, setTab] = useState<CertTabId>("services");
  const [certs, setCerts] = useState(initialCerts);
  const [caStatus, setCaStatus] = useState<CaStatus | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<LiveBindingEvent | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const lastEventIdRef = useRef<string | null>(null);

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

  // Two parallel channels keep the admin UI current:
  //
  //   1. EventSource (SSE)  — zero-latency, best-effort. Disabled silently
  //      if a proxy buffers the stream.
  //   2. Polling every 3 s  — authoritative; uses the events table's id as
  //      cursor so we never miss an event even when SSE is down.
  //
  // Both paths feed the same setLastEvent handler so the UI reacts once.
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

  useEffect(() => {
    let cancelled = false;
    async function pollOnce() {
      if (document.visibilityState !== "visible") return;
      try {
        const afterParam = lastEventIdRef.current
          ? `?after=${encodeURIComponent(lastEventIdRef.current)}`
          : "";
        const res = await fetch(
          `/api/admin/certificates/events${afterParam}`,
          { credentials: "same-origin", cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          events: Array<{
            id: string;
            ts: string;
            serialNumber: string;
            kind: "created" | "seen" | "denied" | "reset";
            ip?: string;
            userAgent?: string;
            components?: Record<string, string>;
            diff?: { field: string; before: string; after: string }[];
            actor?: string;
          }>;
        };
        for (const ev of data.events) {
          setLastEvent({
            kind: ev.kind,
            serialNumber: ev.serialNumber,
            at: ev.ts,
            ip: ev.ip,
            userAgent: ev.userAgent,
            components: ev.components,
            diff: ev.diff,
            actor: ev.actor,
          });
          lastEventIdRef.current = ev.id;
        }
      } catch {
        // swallow — next tick will retry
      }
    }
    void pollOnce();
    const iv = setInterval(pollOnce, 3_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const tabs: TabDefinition<CertTabId>[] = useMemo(
    () => [
      {
        id: "services",
        label: "Serwisy",
        icon: <ShieldCheck className="w-5 h-5" />,
      },
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
    <AppHeader
      backHref="/dashboard"
      title="Certyfikaty klienckie"
      userLabel={userLabel}
      userSubLabel={userEmail}
      rightExtras={
        <div className="flex items-center gap-3">
          <LiveBadge connected={liveConnected} />
          <CaStatusBadge status={caStatus} />
        </div>
      }
    />
  );

  return (
    <PageShell maxWidth="xl" header={header}>
      <section className="mb-6">
        <p className="text-sm text-[var(--text-muted)]">
          Wystawianie i zarządzanie certyfikatami mTLS dla paneli sprzedawcy,
          serwisanta oraz kierowcy.
        </p>
      </section>
      <OnboardingCard
        storageKey="admin-certs"
        title="Certyfikaty klienckie (PKCS12)"
        requiresArea="certificates"
        requiresMinPriority={90}
      >
        Wystawienie generuje paczkę PKCS12 z step-ca, mailuje ją userowi i
        zapisuje audit-trail. Traefik mTLS (RequireAndVerifyClientCert) wpuszcza
        tylko certy z naszej CA. Revoke = natychmiastowy block (CRL fetch co 5
        min).
      </OnboardingCard>
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
          <TabPanel tabId="services" active={tab === "services"}>
            <ServicesPanel />
          </TabPanel>
          <TabPanel tabId="issue" active={tab === "issue"}>
            <IssueCertPanel onIssued={refreshAll} />
          </TabPanel>
          <TabPanel tabId="list" active={tab === "list"}>
            <CertListPanel
              certs={certs}
              onChange={refreshAll}
              lastEvent={lastEvent}
            />
          </TabPanel>
          <TabPanel tabId="audit" active={tab === "audit"}>
            <AuditLogPanel audit={audit} />
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
  const expiryColor = rootExpiryColorClass(status.rootDaysLeft);
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
        {status.online && typeof status.rootDaysLeft === "number" && (
          <>
            {" · "}
            <span
              className={expiryColor}
              title={
                status.rootNotAfter
                  ? `Root CA wygasa: ${new Date(status.rootNotAfter).toLocaleString("pl-PL")}`
                  : undefined
              }
            >
              root: {status.rootDaysLeft} dni
            </span>
          </>
        )}
      </span>
    </div>
  );
}
