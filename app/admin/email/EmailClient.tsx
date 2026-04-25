"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Palette,
  Save,
  Send,
  Server,
  Sparkles,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  PageShell,
  TabPanel,
  Tabs,
  Textarea,
  type TabDefinition,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { api, ApiRequestError } from "@/lib/api-client";

type TabId = "branding" | "kc-templates" | "postal" | "catalog" | "test-send";

interface Branding {
  brandName: string;
  brandUrl: string | null;
  brandLogoUrl: string | null;
  primaryColor: string | null;
  supportEmail: string | null;
  legalName: string | null;
  fromDisplay: string | null;
  replyTo: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

interface PropagationTarget {
  appId: string;
  appLabel: string;
  envKeys: string[];
  requiresRedeploy: boolean;
}

interface KcTemplateEntry {
  key: string;
  label: string;
  value: string | null;
  hasOverride: boolean;
}

interface PostalOrg {
  id: number;
  uuid: string;
  name: string;
  permalink: string;
  serverCount: number;
  createdAt: string;
}

interface PostalServer {
  id: number;
  uuid: string;
  organizationId: number;
  organizationName: string;
  name: string;
  mode: string;
  postmasterAddress: string | null;
  sendLimit: number | null;
  suspended: boolean;
  createdAt: string;
}

interface PostalCredential {
  id: number;
  type: string;
  name: string;
  key: string;
  hold: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface PostalDomain {
  id: number;
  name: string;
  serverId: number | null;
  spfStatus: string | null;
  dkimStatus: string | null;
  mxStatus: string | null;
  returnPathStatus: string | null;
  verifiedAt: string | null;
  outgoing: boolean;
  incoming: boolean;
}

interface CatalogEntry {
  app: string;
  appLabel: string;
  id: string;
  name: string;
  trigger: string;
  variables: Array<{ key: string; description: string }>;
  attachments: Array<{ type: string; name: string; description: string }>;
  editable:
    | { kind: "kc-localization"; subjectKey: string; bodyKey: string }
    | { kind: "branding-only"; note: string }
    | { kind: "source-fork"; sourceLink: string };
}

export function EmailClient({
  userLabel,
  userEmail,
}: {
  userLabel?: string;
  userEmail?: string;
}) {
  const [tab, setTab] = useState<TabId>("branding");

  const tabs: TabDefinition<TabId>[] = useMemo(
    () => [
      {
        id: "branding",
        label: "Branding",
        icon: <Palette className="w-5 h-5" />,
      },
      {
        id: "kc-templates",
        label: "Keycloak — szablony",
        icon: <Mail className="w-5 h-5" />,
      },
      {
        id: "postal",
        label: "Postal (poczta)",
        icon: <Server className="w-5 h-5" />,
      },
      {
        id: "catalog",
        label: "Katalog emaili",
        icon: <FileText className="w-5 h-5" />,
      },
      {
        id: "test-send",
        label: "Wyślij testowy",
        icon: <Send className="w-5 h-5" />,
      },
    ],
    [],
  );

  const header = (
    <AppHeader
      backHref="/dashboard"
      title="Email — centralny panel"
      userLabel={userLabel}
      userSubLabel={userEmail}
    />
  );

  return (
    <PageShell maxWidth="xl" header={header}>
      <section className="mb-6">
        <p className="text-sm text-[var(--text-muted)]">
          Kontrola wszystkich kanałów email w stacku: branding propagowany do
          aplikacji, custom szablony Keycloak, zarządzanie Postalem (serwery,
          skrzynki, domeny), katalog wszystkich wysyłanych emaili, test send.
        </p>
      </section>
      <div className="grid lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1">
          <Tabs
            tabs={tabs}
            activeTab={tab}
            onChange={setTab}
            orientation="vertical"
            ariaLabel="Sekcje email"
          />
        </aside>
        <div className="lg:col-span-3 space-y-6">
          <TabPanel tabId="branding" active={tab === "branding"}>
            <BrandingPanel />
          </TabPanel>
          <TabPanel tabId="kc-templates" active={tab === "kc-templates"}>
            <KcTemplatesPanel />
          </TabPanel>
          <TabPanel tabId="postal" active={tab === "postal"}>
            <PostalPanel />
          </TabPanel>
          <TabPanel tabId="catalog" active={tab === "catalog"}>
            <CatalogPanel />
          </TabPanel>
          <TabPanel tabId="test-send" active={tab === "test-send"}>
            <TestSendPanel />
          </TabPanel>
        </div>
      </div>
    </PageShell>
  );
}

// ── Branding ────────────────────────────────────────────────────────────────

function BrandingPanel() {
  const [data, setData] = useState<Branding | null>(null);
  const [targets, setTargets] = useState<PropagationTarget[]>([]);
  const [draft, setDraft] = useState<Partial<Branding>>({});
  const [busy, setBusy] = useState(false);
  const [propagating, setPropagating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [results, setResults] = useState<
    Array<{
      appId: string;
      appLabel: string;
      status: string;
      envChanges: number;
      redeployTriggered: boolean;
      error?: string;
    }> | null
  >(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ branding: Branding; targets: PropagationTarget[] }>(
        "/api/admin/email/branding",
      );
      setData(r.branding);
      setTargets(r.targets);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.put<{ branding: Branding }, Partial<Branding>>(
        "/api/admin/email/branding",
        draft,
      );
      setData(r.branding);
      setDraft({});
      setNotice('Branding zapisany. Kliknij „Zastosuj wszędzie" żeby propagować do apek.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function propagate(applyRedeploy: boolean) {
    if (
      applyRedeploy &&
      !confirm(
        "Propagacja z redeploy uruchomi rebuild Documenso + Dashboard (~5 min downtime na każdą). Kontynuować?",
      )
    ) {
      return;
    }
    setPropagating(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.post<
        { results: typeof results },
        { applyRedeploy: boolean }
      >("/api/admin/email/branding/propagate", { applyRedeploy });
      setResults(r.results);
      setNotice(
        applyRedeploy
          ? "Propagacja zakończona — apki które wymagały rebuildu są w trakcie redeployu."
          : "Envy ustawione. Apki runtime-only odebrały zmiany; apki buildtime wymagają redeployu.",
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Propagate failed");
    } finally {
      setPropagating(false);
    }
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Loader2 className="w-4 h-4 animate-spin" />
        Ładowanie…
      </div>
    );
  }

  const merged = { ...data, ...draft };

  return (
    <div className="space-y-4">
      <Card padding="lg">
        <CardHeader
          icon={<Palette className="w-6 h-6 text-[var(--accent)]" />}
          title="Globalne dane marki"
          description="Zmienne propagowane do wszystkich aplikacji w stacku jako env. Aplikacje renderują je w nagłówkach emaili, panelach UI, stronach logowania."
        />
        {error && <Alert tone="error" className="mt-4">{error}</Alert>}
        {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <Input
            label="Nazwa marki"
            value={merged.brandName ?? ""}
            onChange={(e) => setDraft({ ...draft, brandName: e.target.value })}
          />
          <Input
            label="URL marki"
            placeholder="https://myperformance.pl"
            value={merged.brandUrl ?? ""}
            onChange={(e) => setDraft({ ...draft, brandUrl: e.target.value })}
          />
          <Input
            label="URL logo"
            placeholder="https://.../logo.png"
            value={merged.brandLogoUrl ?? ""}
            onChange={(e) => setDraft({ ...draft, brandLogoUrl: e.target.value })}
          />
          <Input
            label="Główny kolor (hex)"
            placeholder="#0d6efd"
            value={merged.primaryColor ?? ""}
            onChange={(e) => setDraft({ ...draft, primaryColor: e.target.value })}
          />
          <Input
            label="Support email"
            placeholder="support@myperformance.pl"
            value={merged.supportEmail ?? ""}
            onChange={(e) => setDraft({ ...draft, supportEmail: e.target.value })}
          />
          <Input
            label="Nazwa prawna firmy"
            placeholder="MyPerformance Sp. z o.o."
            value={merged.legalName ?? ""}
            onChange={(e) => setDraft({ ...draft, legalName: e.target.value })}
          />
          <Input
            label="Nazwa nadawcy emaili (From display)"
            placeholder="MyPerformance"
            value={merged.fromDisplay ?? ""}
            onChange={(e) => setDraft({ ...draft, fromDisplay: e.target.value })}
          />
          <Input
            label="Reply-To address"
            placeholder="noreply@myperformance.pl"
            value={merged.replyTo ?? ""}
            onChange={(e) => setDraft({ ...draft, replyTo: e.target.value })}
          />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            onClick={save}
            loading={busy}
            disabled={Object.keys(draft).length === 0}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Zapisz
          </Button>
          <Button
            variant="secondary"
            onClick={() => propagate(false)}
            loading={propagating}
            leftIcon={<Sparkles className="w-4 h-4" />}
          >
            Zastosuj envy (bez redeploy)
          </Button>
          <Button
            onClick={() => propagate(true)}
            loading={propagating}
            leftIcon={<Sparkles className="w-4 h-4" />}
          >
            Zastosuj wszędzie + redeploy
          </Button>
        </div>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Ostatnia zmiana: {new Date(data.updatedAt).toLocaleString("pl-PL")}
          {data.updatedBy ? ` przez ${data.updatedBy}` : ""}.
        </p>
      </Card>

      <Card padding="md">
        <h3 className="text-sm font-semibold text-[var(--text-main)] mb-3">
          Aplikacje docelowe propagacji
        </h3>
        <div className="grid md:grid-cols-2 gap-2">
          {targets.map((t) => (
            <div
              key={t.appId}
              className="text-xs px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
            >
              <div className="font-medium text-[var(--text-main)]">
                {t.appLabel}{" "}
                {t.requiresRedeploy && (
                  <Badge tone="warning" className="ml-1">
                    redeploy
                  </Badge>
                )}
              </div>
              <div className="text-[var(--text-muted)] mt-1 font-mono">
                {t.envKeys.join(" · ")}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {results && (
        <Card padding="md">
          <h3 className="text-sm font-semibold text-[var(--text-main)] mb-3">
            Wynik ostatniej propagacji
          </h3>
          <ul className="space-y-1.5 text-xs">
            {results.map((r) => (
              <li
                key={r.appId}
                className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--border-subtle)]"
              >
                <Badge
                  tone={
                    r.status === "ok"
                      ? "success"
                      : r.status === "skipped"
                        ? "neutral"
                        : "danger"
                  }
                >
                  {r.status}
                </Badge>
                <span className="font-medium">{r.appLabel}</span>
                <span className="text-[var(--text-muted)]">
                  envy zmienione: {r.envChanges}
                  {r.redeployTriggered ? " · redeploy uruchomiony" : ""}
                  {r.error ? ` · ${r.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ── KC Templates ────────────────────────────────────────────────────────────

function KcTemplatesPanel() {
  const [entries, setEntries] = useState<KcTemplateEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ entries: KcTemplateEntry[] }>(
        "/api/admin/email/kc-templates",
      );
      setEntries(r.entries);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(key: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await api.put<unknown, { value: string }>(
        `/api/admin/email/kc-templates/${encodeURIComponent(key)}`,
        { value: drafts[key] },
      );
      setNotice(`Zapisano "${key}". Keycloak odpowie nim natychmiast.`);
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function reset(key: string) {
    if (!confirm("Przywrócić domyślne tłumaczenie Keycloak?")) return;
    setBusy(key);
    try {
      await api.delete(`/api/admin/email/kc-templates/${encodeURIComponent(key)}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Reset failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card padding="lg">
      <CardHeader
        icon={<Mail className="w-6 h-6 text-[var(--accent)]" />}
        title="Szablony emaili Keycloak (locale: pl)"
        description={'Edycja subjectów + treści emaili wysyłanych przez KC (verify-email, reset-password, executable-action). Zapis idzie przez Admin API → realm localization. Custom override znika gdy klikniesz „Reset".'}
      />
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      <div className="mt-5 space-y-3">
        {entries.map((e) => {
          const current = drafts[e.key] ?? e.value ?? "";
          const dirty = drafts[e.key] !== undefined;
          return (
            <div
              key={e.key}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3"
            >
              <div className="flex items-center justify-between mb-2 gap-2">
                <div>
                  <div className="text-sm font-medium text-[var(--text-main)]">
                    {e.label}
                  </div>
                  <code className="text-[10px] text-[var(--text-muted)]">
                    {e.key}
                  </code>
                </div>
                <div className="flex items-center gap-1.5">
                  {e.hasOverride && <Badge tone="success">override</Badge>}
                  {!e.hasOverride && <Badge tone="neutral">default</Badge>}
                </div>
              </div>
              <Textarea
                rows={e.key.includes("Body") ? 6 : 2}
                value={current}
                onChange={(ev) =>
                  setDrafts({ ...drafts, [e.key]: ev.target.value })
                }
                placeholder="(używa domyślnego tłumaczenia KC)"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => save(e.key)}
                  loading={busy === e.key}
                  disabled={!dirty}
                  leftIcon={<Save className="w-4 h-4" />}
                >
                  Zapisz
                </Button>
                {e.hasOverride && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => reset(e.key)}
                    loading={busy === e.key}
                  >
                    Przywróć domyślne
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Postal ──────────────────────────────────────────────────────────────────

function PostalPanel() {
  const [orgs, setOrgs] = useState<PostalOrg[]>([]);
  const [servers, setServers] = useState<PostalServer[]>([]);
  const [domains, setDomains] = useState<PostalDomain[]>([]);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [credentials, setCredentials] = useState<PostalCredential[]>([]);
  const [newOrgName, setNewOrgName] = useState("");
  const [newServer, setNewServer] = useState<{ name: string; orgId: number | null }>({
    name: "",
    orgId: null,
  });
  const [newCred, setNewCred] = useState<{ type: "SMTP" | "API"; name: string }>({
    type: "SMTP",
    name: "",
  });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [o, s, d] = await Promise.all([
        api.get<{ organizations: PostalOrg[]; configured: boolean }>(
          "/api/admin/email/postal/organizations",
        ),
        api.get<{ servers: PostalServer[]; configured: boolean }>(
          "/api/admin/email/postal/servers",
        ),
        api.get<{ domains: PostalDomain[]; configured: boolean }>(
          "/api/admin/email/postal/domains",
        ),
      ]);
      setConfigured(o.configured && s.configured);
      setOrgs(o.organizations);
      setServers(s.servers);
      setDomains(d.domains);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (selectedServerId === null) {
      setCredentials([]);
      return;
    }
    void api
      .get<{ credentials: PostalCredential[] }>(
        `/api/admin/email/postal/servers/${selectedServerId}/credentials`,
      )
      .then((r) => setCredentials(r.credentials))
      .catch(() => setCredentials([]));
  }, [selectedServerId]);

  if (!configured) {
    return (
      <Alert tone="warning">
        POSTAL_DB_URL nie jest skonfigurowane w envie dashboardu. Skontaktuj
        admina infrastruktury — wymagany dostęp do bazy MariaDB Postala.
      </Alert>
    );
  }

  async function createOrg() {
    if (!newOrgName.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/admin/email/postal/organizations", { name: newOrgName });
      setNewOrgName("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function createServer() {
    if (!newServer.name.trim() || !newServer.orgId) return;
    setBusy(true);
    try {
      await api.post("/api/admin/email/postal/servers", {
        name: newServer.name,
        organizationId: newServer.orgId,
      });
      setNewServer({ name: "", orgId: null });
      await reload();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function createCred() {
    if (selectedServerId === null || !newCred.name.trim()) return;
    setBusy(true);
    try {
      await api.post(
        `/api/admin/email/postal/servers/${selectedServerId}/credentials`,
        newCred,
      );
      setNewCred({ type: "SMTP", name: "" });
      const r = await api.get<{ credentials: PostalCredential[] }>(
        `/api/admin/email/postal/servers/${selectedServerId}/credentials`,
      );
      setCredentials(r.credentials);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <Card padding="lg">
        <CardHeader
          icon={<Building2 className="w-6 h-6 text-[var(--accent)]" />}
          title="Organizacje Postal"
          description="Top-level grupowanie serverów. Każda apka stacku zwykle ma własną org dla izolacji limitów i statystyk."
        />
        <div className="mt-4 flex gap-2">
          <Input
            placeholder="Nazwa nowej organizacji"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
          />
          <Button onClick={createOrg} loading={busy} disabled={!newOrgName.trim()}>
            Utwórz
          </Button>
        </div>
        <div className="mt-4 grid gap-2">
          {orgs.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between text-sm border border-[var(--border-subtle)] rounded-lg px-3 py-2"
            >
              <div>
                <div className="font-medium">{o.name}</div>
                <div className="text-xs text-[var(--text-muted)] font-mono">
                  {o.permalink} · {o.uuid.slice(0, 8)}…
                </div>
              </div>
              <Badge tone="neutral">{o.serverCount} serwer(y)</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader
          icon={<Server className="w-6 h-6 text-[var(--accent)]" />}
          title="Serwery pocztowe"
          description="Każdy serwer ma własny limit, postmaster, message retention. Apka konfiguruje SMTP credentials per-serwer."
        />
        <div className="mt-4 flex gap-2 flex-wrap">
          <select
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
            value={newServer.orgId ?? ""}
            onChange={(e) =>
              setNewServer({
                ...newServer,
                orgId: e.target.value ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">— wybierz organizację —</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <Input
            placeholder="Nazwa serwera (np. transactional, marketing)"
            value={newServer.name}
            onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
          />
          <Button
            onClick={createServer}
            loading={busy}
            disabled={!newServer.name.trim() || !newServer.orgId}
          >
            Utwórz
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {servers.map((s) => (
            <div
              key={s.id}
              className={`border rounded-lg px-3 py-2 cursor-pointer transition ${
                selectedServerId === s.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border-subtle)]"
              }`}
              onClick={() =>
                setSelectedServerId(selectedServerId === s.id ? null : s.id)
              }
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">
                    {s.name}{" "}
                    <span className="text-xs text-[var(--text-muted)]">
                      · {s.organizationName} · {s.mode}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    postmaster: {s.postmasterAddress ?? "—"}
                  </div>
                </div>
                {s.suspended && <Badge tone="danger">suspended</Badge>}
              </div>
              {selectedServerId === s.id && (
                <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-3">
                  <div>
                    <div className="text-xs font-semibold mb-2">
                      Skrzynki / poświadczenia (SMTP + API)
                    </div>
                    <div className="space-y-1.5">
                      {credentials.length === 0 && (
                        <div className="text-xs text-[var(--text-muted)]">
                          Brak credentials.
                        </div>
                      )}
                      {credentials.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-[var(--bg-main)]"
                        >
                          <div>
                            <Badge tone="neutral" className="mr-2">
                              {c.type}
                            </Badge>
                            <span className="font-mono">{c.name}</span>
                          </div>
                          <code className="text-[10px] text-[var(--text-muted)]">
                            {c.key.slice(0, 16)}…
                          </code>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2 items-end">
                      <select
                        className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs"
                        value={newCred.type}
                        onChange={(e) =>
                          setNewCred({
                            ...newCred,
                            type: e.target.value as "SMTP" | "API",
                          })
                        }
                      >
                        <option value="SMTP">SMTP</option>
                        <option value="API">API</option>
                      </select>
                      <Input
                        placeholder="Nazwa (np. main, marketing)"
                        value={newCred.name}
                        onChange={(e) =>
                          setNewCred({ ...newCred, name: e.target.value })
                        }
                      />
                      <Button
                        size="sm"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void createCred();
                        }}
                        disabled={!newCred.name.trim()}
                        loading={busy}
                      >
                        Dodaj
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader
          icon={<Activity className="w-6 h-6 text-[var(--accent)]" />}
          title="Domeny + status DNS"
          description="Każda domena nadawcza wymaga DKIM/SPF/MX żeby Postal mógł dostarczać bez bounces."
        />
        <div className="mt-4 grid gap-2">
          {domains.map((d) => (
            <div
              key={d.id}
              className="text-sm border border-[var(--border-subtle)] rounded-lg px-3 py-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{d.name}</span>
                <div className="flex gap-1">
                  <Badge tone={d.spfStatus === "OK" ? "success" : "warning"}>
                    SPF: {d.spfStatus ?? "?"}
                  </Badge>
                  <Badge tone={d.dkimStatus === "OK" ? "success" : "warning"}>
                    DKIM: {d.dkimStatus ?? "?"}
                  </Badge>
                  <Badge tone={d.mxStatus === "OK" ? "success" : "warning"}>
                    MX: {d.mxStatus ?? "?"}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
          {domains.length === 0 && (
            <div className="text-xs text-[var(--text-muted)]">
              Brak domen. Dodaj je przez Postal Web UI; po dodaniu pojawią się
              tutaj.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Catalog ─────────────────────────────────────────────────────────────────

function CatalogPanel() {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ entries: CatalogEntry[] }>("/api/admin/email/catalog")
      .then((r) => setEntries(r.entries))
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : "Load failed"),
      );
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Loader2 className="w-4 h-4 animate-spin" />
        Ładowanie…
      </div>
    );
  }

  const byApp = entries.reduce<Record<string, CatalogEntry[]>>((acc, e) => {
    (acc[e.appLabel] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(byApp).map(([app, list]) => (
        <Card key={app} padding="lg">
          <h3 className="text-sm font-semibold text-[var(--text-main)] mb-3">
            {app}
          </h3>
          <div className="space-y-2">
            {list.map((e) => (
              <div
                key={`${e.app}:${e.id}`}
                className="border border-[var(--border-subtle)] rounded-lg p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{e.name}</div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {e.trigger}
                    </div>
                  </div>
                  <EditableBadge editable={e.editable} />
                </div>
                {e.variables.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[10px] uppercase text-[var(--text-muted)]">
                      Dostępne zmienne
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {e.variables.map((v) => (
                        <code
                          key={v.key}
                          title={v.description}
                          className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-main)] border border-[var(--border-subtle)]"
                        >
                          {`{{${v.key}}}`}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
                {e.attachments.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[10px] uppercase text-[var(--text-muted)]">
                      Załączniki
                    </div>
                    <div className="flex flex-col gap-0.5 mt-1">
                      {e.attachments.map((a) => (
                        <span
                          key={a.name}
                          className="text-[11px] text-[var(--text-muted)]"
                        >
                          <Badge tone="neutral" className="mr-1">
                            {a.type}
                          </Badge>
                          {a.name} — {a.description}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function EditableBadge({ editable }: { editable: CatalogEntry["editable"] }) {
  if (editable.kind === "kc-localization") {
    return <Badge tone="success">edytowalne (KC localization)</Badge>;
  }
  if (editable.kind === "branding-only") {
    return (
      <Badge tone="warning" title={editable.note}>
        tylko branding
      </Badge>
    );
  }
  return (
    <a
      href={editable.sourceLink}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]"
    >
      source <ExternalLink className="w-3 h-3" />
    </a>
  );
}

// ── Test send ───────────────────────────────────────────────────────────────

function TestSendPanel() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState(
    "Cześć {{recipient}},\n\nTo jest test z panelu admina. Marka: {{brandName}}.\n\nPozdrawiamy,\n{{actor}}",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.post<{ messageId: string; accepted: string[] }, {
        to: string;
        subject?: string;
        body?: string;
      }>("/api/admin/email/test-send", {
        to,
        subject: subject || undefined,
        body: bodyText,
      });
      setNotice(
        `Wysłane (id: ${r.messageId}). Zaakceptowane: ${r.accepted.join(", ")}.`,
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="lg">
      <CardHeader
        icon={<Send className="w-6 h-6 text-[var(--accent)]" />}
        title="Wyślij testowy email"
        description="Idzie przez SMTP gateway dashboardu (ten sam co cert-delivery). Zmienne {{brandName}}, {{supportEmail}}, {{recipient}}, {{actor}} są podstawiane automatycznie."
      />
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <Input
          label="Do"
          type="email"
          required
          placeholder="test@example.com"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Input
          label={'Temat (opcjonalny — default = „[Test] {brand} email gateway")'}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <div className="mt-4">
        <label className="text-xs text-[var(--text-muted)] mb-1 block">
          Treść (text/plain, zmienne handlebars-style)
        </label>
        <Textarea
          rows={10}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
        />
      </div>
      <div className="mt-4">
        <Button
          onClick={send}
          loading={busy}
          disabled={!to.trim()}
          leftIcon={<Send className="w-4 h-4" />}
        >
          Wyślij
        </Button>
      </div>
    </Card>
  );
}
