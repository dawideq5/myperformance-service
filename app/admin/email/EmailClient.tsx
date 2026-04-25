"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Eye,
  FileText,
  GitBranch,
  Info,
  Loader2,
  Lock,
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

type TabId =
  | "start"
  | "branding"
  | "kc-templates"
  | "postal"
  | "catalog"
  | "test-send";

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
  const [tab, setTab] = useState<TabId>("start");

  const tabs: TabDefinition<TabId>[] = useMemo(
    () => [
      {
        id: "start",
        label: "Start",
        icon: <Info className="w-5 h-5" />,
      },
      {
        id: "branding",
        label: "Branding",
        icon: <Palette className="w-5 h-5" />,
      },
      {
        id: "kc-templates",
        label: "Treść maili Keycloak",
        icon: <Mail className="w-5 h-5" />,
      },
      {
        id: "postal",
        label: "Serwery pocztowe (Postal)",
        icon: <Server className="w-5 h-5" />,
      },
      {
        id: "catalog",
        label: "Mapa wszystkich maili",
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
          <TabPanel tabId="start" active={tab === "start"}>
            <StartPanel onGoTo={setTab} />
          </TabPanel>
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

// ── Start (onboarding) ──────────────────────────────────────────────────────

function StartPanel({ onGoTo }: { onGoTo: (t: TabId) => void }) {
  return (
    <div className="space-y-4">
      <Card padding="lg">
        <CardHeader
          icon={<Info className="w-6 h-6 text-[var(--accent)]" />}
          title="Centrum email — co tu można zrobić"
          description="Każda aplikacja w stacku (Keycloak, Documenso, Chatwoot, Moodle, Outline, Directus, Dashboard) wysyła własne maile. Tu masz zebrane wszystko w jednym miejscu — co się wysyła, jak to wygląda, do kogo, którą drogą."
        />
      </Card>

      <UseCaseTile
        icon={<Palette className="w-6 h-6 text-fuchsia-400" />}
        title="1. Zmiana wyglądu marki we wszystkich apkach"
        description="Wpisujesz nazwę marki, URL strony, logo, kolor — naciskasz przycisk i te dane lecą do każdej apki. Apki używają ich w nagłówkach maili, na ekranie logowania, w nazwie nadawcy itp."
        examples={[
          'Nazwa "MyPerformance" → widoczna w mailach z Documenso jako nadawca',
          "Logo URL → automatycznie pojawia się w mailach Chatwoot",
          "Kolor #0d6efd → tło przycisków w mailach Keycloak",
        ]}
        cta="Otwórz Branding"
        onClick={() => onGoTo("branding")}
      />

      <UseCaseTile
        icon={<Mail className="w-6 h-6 text-emerald-400" />}
        title="2. Edycja TREŚCI maili Keycloak"
        description={'Keycloak wysyła m.in. „Zweryfikuj email", „Reset hasła", „Wymagana akcja". Tu możesz zmienić temat i treść każdego z nich w języku polskim. Zmiany są natychmiastowe, bez restartu.'}
        examples={[
          'Temat „Verify email" → „Witaj w MyPerformance — potwierdź adres"',
          "Treść resetu hasła → dodaj informację kontaktową support@",
          "Reset do domyślnej treści Keycloak jednym kliknięciem",
        ]}
        cta="Otwórz edytor maili KC"
        onClick={() => onGoTo("kc-templates")}
      />

      <UseCaseTile
        icon={<Server className="w-6 h-6 text-amber-400" />}
        title="3. Zarządzanie infrastrukturą Postal"
        description="Postal to nasz własny serwer pocztowy (jak SendGrid). Tu tworzysz organizacje, serwery (osobne dla różnych apek), generujesz SMTP credentials, sprawdzasz status DKIM/SPF/MX domen."
        examples={[
          'Utwórz serwer "transactional" dla maili z Documenso',
          "Wygeneruj klucz SMTP i podpięty pod apkę przez Coolify env",
          "Sprawdź czy domena ma poprawne DKIM/SPF (zielony status = wysyłka działa)",
        ]}
        cta="Otwórz Postal"
        onClick={() => onGoTo("postal")}
      />

      <UseCaseTile
        icon={<FileText className="w-6 h-6 text-sky-400" />}
        title="4. Lista wszystkich maili (do diagnostyki)"
        description="Każdy mail wysyłany przez stack opisany: kiedy się wysyła, jakie zmienne są dostępne, jakie załączniki dochodzą, gdzie edytujemy treść. Read-only inwentaryzacja."
        cta="Otwórz mapę maili"
        onClick={() => onGoTo("catalog")}
      />

      <UseCaseTile
        icon={<Send className="w-6 h-6 text-cyan-400" />}
        title="5. Wysyłka testowa"
        description="Wyślij testowy mail na dowolny adres przez nasz SMTP gateway (Postal). Dobre do sprawdzenia czy konfiguracja działa po zmianach DNS lub kluczy SMTP."
        cta="Otwórz test send"
        onClick={() => onGoTo("test-send")}
      />

      <Card padding="md">
        <h3 className="text-sm font-semibold text-[var(--text-main)] flex items-center gap-2 mb-3">
          <AlertCircle className="w-4 h-4 text-amber-400" /> Czego TU nie ma
        </h3>
        <ul className="text-xs text-[var(--text-muted)] space-y-1.5">
          <li>
            • Edycja treści maili Documenso/Outline/Chatwoot — ich szablony
            siedzą w kodzie aplikacji (potrzebny fork) i nie da się ich edytować
            bez modyfikacji kodu.
          </li>
          <li>
            • Pełny edytor wizualny HTML — Keycloak akceptuje plain HTML
            (textarea), nie ma drag-and-drop builder'a.
          </li>
          <li>
            • Email gateway przez dashboard — kiedyś planowane, ale wymaga
            uruchomienia własnego SMTP daemon w dashboardzie. Obecnie apki
            wysyłają bezpośrednio przez Postal SMTP.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function UseCaseTile({
  icon,
  title,
  description,
  examples,
  cta,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  examples?: string[];
  cta: string;
  onClick: () => void;
}) {
  return (
    <Card padding="md">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-[var(--bg-main)]">{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-main)]">
            {title}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>
          {examples && (
            <ul className="mt-2 space-y-0.5">
              {examples.map((e, i) => (
                <li key={i} className="text-[11px] text-[var(--text-muted)]">
                  → {e}
                </li>
              ))}
            </ul>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            rightIcon={<ChevronRight className="w-4 h-4" />}
            onClick={onClick}
          >
            {cta}
          </Button>
        </div>
      </div>
    </Card>
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
    setError(null);
    try {
      const r = await api.get<{ branding: Branding; targets: PropagationTarget[] }>(
        "/api/admin/email/branding",
      );
      setData(r.branding);
      setTargets(r.targets);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? `Nie udało się załadować brandingu: ${err.message}`
          : "Błąd ładowania",
      );
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
      setNotice(
        "Zapisane do bazy. Aby zmiana doleciała do apek, kliknij przycisk propagacji niżej.",
      );
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Zapis nie powiódł się",
      );
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
      const failed = (r.results ?? []).filter((x) => x.status === "failed");
      if (failed.length > 0) {
        setError(
          `${failed.length} z ${(r.results ?? []).length} apek zwróciło błąd — zobacz tabelę poniżej.`,
        );
      } else {
        setNotice(
          applyRedeploy
            ? "Wysłane do wszystkich apek. Apki które wymagały rebuildu są w trakcie redeployu (~5 min)."
            : "Envy ustawione. Apki runtime-only odebrały zmiany; apki buildtime (Documenso, Dashboard) wymagają redeployu osobno.",
        );
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Propagate failed");
    } finally {
      setPropagating(false);
    }
  }

  if (!data) {
    return (
      <Card padding="lg">
        {error ? (
          <Alert tone="error">{error}</Alert>
        ) : (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Ładowanie brandingu z bazy…
          </div>
        )}
      </Card>
    );
  }

  const merged = { ...data, ...draft };
  const dirty = Object.keys(draft).length > 0;

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex gap-3 items-start">
          <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-muted)]">
            <strong className="text-[var(--text-main)]">Jak to działa:</strong>{" "}
            zapisujesz dane → klikasz <em>Propaguj</em> → dashboard ustawia
            odpowiednie envy w każdej apce w Coolify. Apki podchwytują nową
            wartość przy następnym requesta (runtime) lub po redeploy
            (buildtime — Documenso, Dashboard).
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader
          icon={<Palette className="w-6 h-6 text-[var(--accent)]" />}
          title="Globalne dane marki"
          description="Te zmienne lecą jako env do każdej apki. Apka renderuje je w mailach, ekranie logowania, headerze itp."
        />
        {error && <Alert tone="error" className="mt-4">{error}</Alert>}
        {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <Input
            label="Nazwa marki *"
            value={merged.brandName ?? ""}
            onChange={(e) => setDraft({ ...draft, brandName: e.target.value })}
            placeholder="MyPerformance"
          />
          <Input
            label="URL strony"
            value={merged.brandUrl ?? ""}
            onChange={(e) => setDraft({ ...draft, brandUrl: e.target.value })}
            placeholder="https://myperformance.pl"
          />
          <Input
            label="URL logo (PNG/SVG, hostowany publicznie)"
            value={merged.brandLogoUrl ?? ""}
            onChange={(e) => setDraft({ ...draft, brandLogoUrl: e.target.value })}
            placeholder="https://myperformance.pl/logo.png"
          />
          <Input
            label="Kolor główny (hex)"
            value={merged.primaryColor ?? ""}
            onChange={(e) => setDraft({ ...draft, primaryColor: e.target.value })}
            placeholder="#0d6efd"
          />
          <Input
            label="Email pomocy / supportu"
            value={merged.supportEmail ?? ""}
            onChange={(e) => setDraft({ ...draft, supportEmail: e.target.value })}
            placeholder="support@myperformance.pl"
          />
          <Input
            label="Pełna nazwa firmy (do stopek prawnych)"
            value={merged.legalName ?? ""}
            onChange={(e) => setDraft({ ...draft, legalName: e.target.value })}
            placeholder="MyPerformance Sp. z o.o."
          />
          <Input
            label="Wyświetlana nazwa nadawcy"
            value={merged.fromDisplay ?? ""}
            onChange={(e) => setDraft({ ...draft, fromDisplay: e.target.value })}
            placeholder='MyPerformance (przy mailach: "MyPerformance <noreply@…>")'
          />
          <Input
            label="Adres Reply-To"
            value={merged.replyTo ?? ""}
            onChange={(e) => setDraft({ ...draft, replyTo: e.target.value })}
            placeholder="noreply@myperformance.pl"
          />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            onClick={save}
            loading={busy}
            disabled={!dirty}
            leftIcon={<Save className="w-4 h-4" />}
          >
            {dirty ? "Zapisz zmiany" : "Brak niezapisanych zmian"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Ostatnia zmiana: {new Date(data.updatedAt).toLocaleString("pl-PL")}
          {data.updatedBy ? ` przez ${data.updatedBy}` : ""}.
        </p>
      </Card>

      <Card padding="lg">
        <CardHeader
          icon={<Sparkles className="w-6 h-6 text-amber-400" />}
          title="Krok 2: Propaguj zmiany do apek"
          description="Zapisany branding wyślij do Coolify env w każdej apce. Wybierz tryb:"
        />
        <div className="mt-4 grid md:grid-cols-2 gap-3">
          <div className="p-4 border border-[var(--border-subtle)] rounded-lg">
            <h4 className="text-sm font-semibold mb-1">Bez redeploy (szybko)</h4>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Tylko ustawia envy w Coolify. Apki <strong>runtime</strong>{" "}
              (Chatwoot, Outline, Directus, Moodle, KC) — odbiorą natychmiast.
              Apki <strong>buildtime</strong> (Documenso, Dashboard) — czekają
              na osobny redeploy.
            </p>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => propagate(false)}
              loading={propagating}
            >
              Tylko envy (~5 sek)
            </Button>
          </div>
          <div className="p-4 border border-amber-500/40 bg-amber-500/5 rounded-lg">
            <h4 className="text-sm font-semibold mb-1">Z redeploy (pełnie)</h4>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Po envach uruchamia rebuild Documenso + Dashboard. Po ~5 min na
              apkę nowy branding pojawi się wszędzie. <strong>UWAGA:</strong>{" "}
              Documenso i Dashboard będą niedostępne podczas rebuildu.
            </p>
            <Button
              fullWidth
              onClick={() => propagate(true)}
              loading={propagating}
            >
              Envy + redeploy (~5–10 min)
            </Button>
          </div>
        </div>
      </Card>

      <Card padding="md">
        <h3 className="text-sm font-semibold text-[var(--text-main)] mb-3">
          Apki które dostaną branding ({targets.length})
        </h3>
        <div className="grid md:grid-cols-2 gap-2">
          {targets.map((t) => (
            <div
              key={t.appId}
              className="text-xs px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
            >
              <div className="font-medium text-[var(--text-main)] flex items-center gap-2">
                {t.appLabel}
                {t.requiresRedeploy && (
                  <Badge tone="warning">redeploy</Badge>
                )}
              </div>
              <div className="text-[var(--text-muted)] mt-1 font-mono text-[10px]">
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
                {r.status === "ok" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : r.status === "skipped" ? (
                  <Info className="w-4 h-4 text-[var(--text-muted)]" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                )}
                <span className="font-medium">{r.appLabel}</span>
                <span className="text-[var(--text-muted)]">
                  · zmienione: {r.envChanges}
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ entries: KcTemplateEntry[] }>(
        "/api/admin/email/kc-templates",
      );
      setEntries(r.entries);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? `Nie mogę pobrać listy: ${err.message}`
          : "Load failed",
      );
    } finally {
      setLoading(false);
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
      setNotice(`Zapisane „${key}". Keycloak używa nowej treści od następnego maila.`);
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

  // Group by email type (verify-email, password-reset, ...) for cleaner UI.
  const groups = useMemo(() => {
    const map: Record<string, KcTemplateEntry[]> = {};
    for (const e of entries) {
      const prefix = e.key
        .replace(/Subject$|Body$|BodyHtml$/, "")
        .replace(/([A-Z])/g, "-$1")
        .toLowerCase()
        .replace(/^-/, "");
      (map[prefix] ??= []).push(e);
    }
    return map;
  }, [entries]);

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex gap-3 items-start">
          <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-muted)]">
            <strong className="text-[var(--text-main)]">Jak to działa:</strong>{" "}
            Keycloak dla każdego typu maila ma 3 wersje:{" "}
            <code className="text-[10px]">Subject</code> (temat),{" "}
            <code className="text-[10px]">Body</code> (text/plain) i{" "}
            <code className="text-[10px]">BodyHtml</code> (HTML). Edycja
            zapisywana przez Admin API → realm localization (locale: pl).
            Zmiana jest natychmiastowa — nie trzeba restartu KC.
          </div>
        </div>
      </Card>

      <Card padding="md">
        <h3 className="text-sm font-semibold mb-2">Dostępne zmienne</h3>
        <div className="text-xs text-[var(--text-muted)] grid md:grid-cols-2 gap-x-4 gap-y-1 font-mono">
          <div>
            <code>{"${user.firstName}"}</code> — imię użytkownika
          </div>
          <div>
            <code>{"${user.email}"}</code> — adres email
          </div>
          <div>
            <code>{"${link}"}</code> — link akcyjny (verify, reset itp.)
          </div>
          <div>
            <code>{"${linkExpirationFormatter(linkExpiration)}"}</code> — czas
            wygaśnięcia
          </div>
          <div>
            <code>{"${realmName}"}</code> — nazwa realmu (po brandingu = nazwa
            marki)
          </div>
          <div>
            <code>{"${url.accountUrl}"}</code> — URL panelu konta
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {loading ? (
        <Card padding="lg">
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Ładowanie…
          </div>
        </Card>
      ) : (
        Object.entries(groups).map(([groupKey, items]) => (
          <Card key={groupKey} padding="lg">
            <h3 className="text-base font-semibold capitalize mb-1">
              {groupTitle(groupKey)}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              {groupDescription(groupKey)}
            </p>
            <div className="space-y-3">
              {items.map((e) => {
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
                      {e.hasOverride ? (
                        <Badge tone="success">edytowane</Badge>
                      ) : (
                        <Badge tone="neutral">domyślne</Badge>
                      )}
                    </div>
                    <Textarea
                      rows={e.key.includes("Body") ? 6 : 2}
                      value={current}
                      onChange={(ev) =>
                        setDrafts({ ...drafts, [e.key]: ev.target.value })
                      }
                      placeholder="(używa domyślnego tłumaczenia Keycloak)"
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
        ))
      )}
    </div>
  );
}

function groupTitle(key: string): string {
  const t: Record<string, string> = {
    "email-verification": "Weryfikacja adresu email",
    "password-reset": "Reset hasła",
    "execute-actions": "Wymagane akcje (np. zmiana hasła wymuszona przez admina)",
    "email-update-confirmation": "Potwierdzenie zmiany emaila",
    "identity-provider-link": "Powiązanie konta z dostawcą zewnętrznym (Google itp.)",
    "login-disabled": "Powiadomienie o wyłączeniu konta",
  };
  return t[key] ?? key;
}

function groupDescription(key: string): string {
  const d: Record<string, string> = {
    "email-verification": "Wysyłany po rejestracji + przy zmianie emaila — wymaga kliknięcia w link weryfikacyjny.",
    "password-reset": 'Po kliknięciu „Zapomniałem hasła" lub gdy admin wysłał reset.',
    "execute-actions": 'Gdy admin wymusi akcję (np. „zmień hasło") przez Admin API.',
    "email-update-confirmation": "Wysyłany na NOWY adres po zmianie emaila — link potwierdza posiadanie skrzynki.",
    "identity-provider-link": "Gdy user loguje się przez Google/Microsoft a KC chce połączyć z istniejącym kontem.",
    "login-disabled": "Gdy admin wyłączy konto, KC informuje user-a.",
  };
  return d[key] ?? "";
}

// ── Postal ──────────────────────────────────────────────────────────────────

function PostalPanel() {
  const [orgs, setOrgs] = useState<PostalOrg[]>([]);
  const [servers, setServers] = useState<PostalServer[]>([]);
  const [domains, setDomains] = useState<PostalDomain[]>([]);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);

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
      // Auto-advance to next empty step.
      if (o.organizations.length === 0) setStep(1);
      else if (s.servers.length === 0) setStep(2);
      else setStep(3);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!configured) {
    return (
      <Alert tone="warning">
        <strong>POSTAL_DB_URL</strong> nie jest skonfigurowane w envie
        dashboardu. Skontaktuj admina infrastruktury — wymagany dostęp do bazy
        MariaDB Postala.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex gap-3 items-start">
          <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-muted)]">
            <strong className="text-[var(--text-main)]">Hierarchia Postal:</strong>{" "}
            <code>Organizacja</code> → <code>Serwer pocztowy</code> →{" "}
            <code>Skrzynka SMTP/API</code>. Podstaw apkę pod nasz Postal podając
            jej w envach <code>SMTP_HOST=smtp-iut9wf1rz9ey54g7lbkje0je</code>,{" "}
            <code>SMTP_USER=&lt;nazwa skrzynki&gt;</code>,{" "}
            <code>SMTP_PASSWORD=&lt;klucz&gt;</code>.
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <PostalStep
        n={1}
        active={step === 1}
        done={orgs.length > 0}
        title="Organizacja"
        description="Top-level grupowanie. Zwykle jedna na całą firmę. Bez niej nie zrobisz serwera."
      >
        <OrganizationsBlock orgs={orgs} onChange={reload} />
      </PostalStep>

      <PostalStep
        n={2}
        active={step === 2}
        done={servers.length > 0}
        title="Serwer pocztowy"
        description="Każdy serwer ma własny limit, domeny, statystyki. Trzymaj osobno transactional (verify/reset) i marketing — żeby kłopoty marketingu nie psuły dostarczalności transactional."
      >
        <ServersBlock
          orgs={orgs}
          servers={servers}
          onChange={reload}
        />
      </PostalStep>

      <PostalStep
        n={3}
        active={step === 3}
        done={false}
        title="Skrzynki SMTP / API + domeny"
        description="Skrzynka = login + klucz dla apki. Domena = poprawne DKIM/SPF żeby maile nie szły do spamu."
      >
        <CredentialsAndDomainsBlock servers={servers} domains={domains} />
      </PostalStep>
    </div>
  );
}

function PostalStep({
  n,
  active,
  done,
  title,
  description,
  children,
}: {
  n: number;
  active: boolean;
  done: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      padding="md"
      className={
        active
          ? "border-[var(--accent)]"
          : done
            ? "border-emerald-500/30"
            : ""
      }
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
            done
              ? "bg-emerald-500/20 text-emerald-400"
              : active
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--bg-main)] text-[var(--text-muted)]"
          }`}
        >
          {done ? <CheckCircle2 className="w-4 h-4" /> : n}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-main)]">
            Krok {n}: {title}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>
        </div>
      </div>
      <div>{children}</div>
    </Card>
  );
}

function OrganizationsBlock({
  orgs,
  onChange,
}: {
  orgs: PostalOrg[];
  onChange: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/admin/email/postal/organizations", { name });
      setName("");
      await onChange();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <Input
          placeholder='np. "MyPerformance" lub nazwa działu'
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button onClick={create} loading={busy} disabled={!name.trim()}>
          Utwórz
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-2 mt-2">
        {orgs.map((o) => (
          <div
            key={o.id}
            className="flex items-center justify-between text-xs border border-[var(--border-subtle)] rounded-lg px-3 py-2"
          >
            <div>
              <div className="font-medium text-sm">{o.name}</div>
              <code className="text-[10px] text-[var(--text-muted)]">
                {o.permalink}
              </code>
            </div>
            <Badge tone="neutral">{o.serverCount} serwer(y)</Badge>
          </div>
        ))}
        {orgs.length === 0 && (
          <p className="text-xs text-[var(--text-muted)] py-2">
            Brak organizacji. Utwórz pierwszą żeby przejść dalej.
          </p>
        )}
      </div>
    </div>
  );
}

function ServersBlock({
  orgs,
  servers,
  onChange,
}: {
  orgs: PostalOrg[];
  servers: PostalServer[];
  onChange: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim() || !orgId) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/admin/email/postal/servers", {
        name,
        organizationId: orgId,
      });
      setName("");
      await onChange();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {orgs.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] py-2">
          Najpierw utwórz organizację (krok 1).
        </p>
      ) : (
        <div className="grid md:grid-cols-3 gap-2 mb-3">
          <select
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
            value={orgId ?? ""}
            onChange={(e) =>
              setOrgId(e.target.value ? Number(e.target.value) : null)
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
            placeholder='np. "transactional" lub "marketing"'
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            onClick={create}
            loading={busy}
            disabled={!name.trim() || !orgId}
          >
            Utwórz serwer
          </Button>
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="space-y-2 mt-3">
        {servers.map((s) => (
          <div
            key={s.id}
            className="border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-[var(--text-muted)]">
                  {s.organizationName} · tryb: {s.mode}
                </div>
              </div>
              {s.suspended && <Badge tone="danger">zawieszony</Badge>}
            </div>
          </div>
        ))}
        {servers.length === 0 && (
          <p className="text-xs text-[var(--text-muted)] py-2">
            Brak serwerów. Utwórz pierwszy żeby przejść dalej.
          </p>
        )}
      </div>
    </div>
  );
}

function CredentialsAndDomainsBlock({
  servers,
  domains,
}: {
  servers: PostalServer[];
  domains: PostalDomain[];
}) {
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [credentials, setCredentials] = useState<PostalCredential[]>([]);
  const [credName, setCredName] = useState("");
  const [credType, setCredType] = useState<"SMTP" | "API">("SMTP");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedServer === null) {
      setCredentials([]);
      return;
    }
    void api
      .get<{ credentials: PostalCredential[] }>(
        `/api/admin/email/postal/servers/${selectedServer}/credentials`,
      )
      .then((r) => setCredentials(r.credentials))
      .catch((err) =>
        setError(
          err instanceof ApiRequestError ? err.message : "Credentials load fail",
        ),
      );
  }, [selectedServer]);

  async function createCred() {
    if (!selectedServer || !credName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(
        `/api/admin/email/postal/servers/${selectedServer}/credentials`,
        { name: credName, type: credType },
      );
      setCredName("");
      const r = await api.get<{ credentials: PostalCredential[] }>(
        `/api/admin/email/postal/servers/${selectedServer}/credentials`,
      );
      setCredentials(r.credentials);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  if (servers.length === 0) {
    return (
      <p className="text-xs text-[var(--text-muted)] py-2">
        Najpierw utwórz serwer (krok 2).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-[var(--text-muted)] mb-1 block">
          Wybierz serwer dla którego zarządzasz skrzynkami
        </label>
        <select
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
          value={selectedServer ?? ""}
          onChange={(e) =>
            setSelectedServer(e.target.value ? Number(e.target.value) : null)
          }
        >
          <option value="">— wybierz serwer —</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.organizationName} → {s.name}
            </option>
          ))}
        </select>
      </div>

      {selectedServer !== null && (
        <div className="border border-[var(--border-subtle)] rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-2">Skrzynki SMTP / API</h4>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Każda skrzynka ma unikalny klucz. Podstawisz go pod apkę jako
            <code className="ml-1">SMTP_PASSWORD</code> (lub
            <code className="ml-1">API key</code>). Podaj nazwę żeby później
            pamiętać która skrzynka jest dla której apki.
          </p>
          <div className="grid md:grid-cols-3 gap-2 mb-3">
            <select
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
              value={credType}
              onChange={(e) => setCredType(e.target.value as "SMTP" | "API")}
            >
              <option value="SMTP">SMTP (klasyczny mail)</option>
              <option value="API">API (HTTP wysyłka)</option>
            </select>
            <Input
              placeholder='np. "documenso-smtp" lub "moodle-api"'
              value={credName}
              onChange={(e) => setCredName(e.target.value)}
            />
            <Button
              onClick={createCred}
              loading={busy}
              disabled={!credName.trim()}
            >
              Wygeneruj klucz
            </Button>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="space-y-1.5 mt-2">
            {credentials.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-[var(--bg-main)]"
              >
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{c.type}</Badge>
                  <span className="font-mono">{c.name}</span>
                </div>
                <code
                  className="text-[10px] text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)]"
                  title="Kliknij aby skopiować pełny klucz"
                  onClick={() => navigator.clipboard.writeText(c.key)}
                >
                  {c.key.slice(0, 12)}…{c.key.slice(-4)} (klik = kopiuj)
                </code>
              </div>
            ))}
            {credentials.length === 0 && (
              <p className="text-xs text-[var(--text-muted)]">
                Brak skrzynek na tym serwerze.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="border border-[var(--border-subtle)] rounded-lg p-4">
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <GitBranch className="w-4 h-4" /> Domeny + status DNS
        </h4>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Każda domena z której wysyłasz musi mieć poprawne DKIM/SPF/MX żeby
          maile nie lądowały w spamie. Status pochodzi z ostatniego skanu
          Postala. Czerwone = trzeba poprawić DNS.
        </p>
        <div className="grid gap-2">
          {domains.map((d) => (
            <div
              key={d.id}
              className="text-xs border border-[var(--border-subtle)] rounded-lg px-3 py-2"
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
            <p className="text-xs text-[var(--text-muted)]">
              Brak domen. Dodawanie domen wymaga DNS verification w Postal Web
              UI (https://postal.myperformance.pl) — pojawią się tu po
              dodaniu.
            </p>
          )}
        </div>
      </div>
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

  const byApp = entries.reduce<Record<string, CatalogEntry[]>>((acc, e) => {
    (acc[e.appLabel] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex gap-3 items-start">
          <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-muted)]">
            Read-only inwentaryzacja każdego maila wysyłanego przez stack.
            Etykiety na końcu każdego wpisu mówią <strong>gdzie</strong> jest
            edytowalna treść:
            <span className="ml-1">
              <Badge tone="success">edytuj tutaj</Badge> = w zakładce
              „Treść maili Keycloak",
            </span>
            <span className="ml-1">
              <Badge tone="warning">tylko branding</Badge> = treść hardcoded,
              ale brand-vars dochodzą,
            </span>
            <span className="ml-1">
              <Badge tone="neutral">tylko fork</Badge> = zmiana wymaga forka
              repo aplikacji.
            </span>
          </div>
        </div>
      </Card>

      {Object.entries(byApp).map(([app, list]) => (
        <Card key={app} padding="lg">
          <h3 className="text-sm font-semibold text-[var(--text-main)] mb-3">
            {app}{" "}
            <span className="text-[var(--text-muted)] font-normal">
              ({list.length} mail{list.length === 1 ? "" : "e"})
            </span>
          </h3>
          <div className="space-y-2">
            {list.map((e) => (
              <CatalogRow key={`${e.app}:${e.id}`} entry={e} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function CatalogRow({ entry }: { entry: CatalogEntry }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-[var(--border-subtle)] rounded-lg">
      <button
        type="button"
        className="w-full text-left p-3 flex items-start justify-between gap-2"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{entry.name}</div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            <strong>Trigger:</strong> {entry.trigger}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <EditableBadge editable={entry.editable} />
          <ChevronRight
            className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </div>
      </button>
      {expanded && (
        <div className="border-t border-[var(--border-subtle)] p-3 bg-[var(--bg-main)]/30 space-y-3">
          {entry.variables.length > 0 && (
            <div>
              <div className="text-[11px] uppercase text-[var(--text-muted)] mb-1.5">
                Zmienne dostępne w treści
              </div>
              <div className="grid md:grid-cols-2 gap-1.5">
                {entry.variables.map((v) => (
                  <div
                    key={v.key}
                    className="text-[11px] flex items-baseline gap-2"
                  >
                    <code className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      {`{{${v.key}}}`}
                    </code>
                    <span className="text-[var(--text-muted)]">
                      — {v.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {entry.attachments.length > 0 && (
            <div>
              <div className="text-[11px] uppercase text-[var(--text-muted)] mb-1.5">
                Załączniki
              </div>
              {entry.attachments.map((a) => (
                <div key={a.name} className="text-[11px] text-[var(--text-muted)]">
                  <Badge tone="neutral" className="mr-1">
                    {a.type}
                  </Badge>
                  <strong className="text-[var(--text-main)]">{a.name}</strong>{" "}
                  — {a.description}
                </div>
              ))}
            </div>
          )}
          {entry.editable.kind === "branding-only" && (
            <div className="text-[11px] text-[var(--text-muted)] italic">
              {entry.editable.note}
            </div>
          )}
          {entry.editable.kind === "source-fork" && (
            <a
              href={entry.editable.sourceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
            >
              Zobacz źródło szablonu w repo aplikacji{" "}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function EditableBadge({ editable }: { editable: CatalogEntry["editable"] }) {
  if (editable.kind === "kc-localization") {
    return <Badge tone="success">edytuj tutaj</Badge>;
  }
  if (editable.kind === "branding-only") {
    return <Badge tone="warning">tylko branding</Badge>;
  }
  return <Badge tone="neutral">tylko fork</Badge>;
}

// ── Test send ───────────────────────────────────────────────────────────────

function TestSendPanel() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState(
    "Cześć {{recipient}},\n\nTo jest test z panelu admina dashboardu.\nMarka: {{brandName}}\nSupport: {{supportEmail}}\n\nPozdrawiamy,\n{{actor}}",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ messageId: string; accepted: string[] } | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.post<
        { messageId: string; accepted: string[] },
        { to: string; subject?: string; body?: string }
      >("/api/admin/email/test-send", {
        to,
        subject: subject || undefined,
        body: bodyText,
      });
      setResult({ messageId: r.messageId, accepted: r.accepted });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex gap-3 items-start">
          <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-muted)]">
            Wysyłka idzie przez ten sam SMTP gateway co cert-delivery — Postal
            transactional. Jeśli mail nie dochodzi, sprawdź zakładkę „Postal" →
            domeny → status DKIM/SPF (powinny być wszystkie zielone).
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader
          icon={<Send className="w-6 h-6 text-[var(--accent)]" />}
          title="Wyślij testowy email"
          description={
            'Zmienne {{brandName}}, {{supportEmail}}, {{recipient}}, {{actor}} są podstawiane automatycznie z brandingu.'
          }
        />
        {error && <Alert tone="error" className="mt-4">{error}</Alert>}
        {result && (
          <Alert tone="success" className="mt-4">
            <strong>Wysłane.</strong> Message-ID:{" "}
            <code className="text-[10px]">{result.messageId}</code>. Postal
            zaakceptował: {result.accepted.join(", ")}.
          </Alert>
        )}
        <div className="grid md:grid-cols-2 gap-4 mt-5">
          <Input
            label="Do (adres odbiorcy) *"
            type="email"
            required
            placeholder="test@example.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <Input
            label="Temat (opcjonalny)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder='Domyślny: "[Test] {brand} email gateway"'
          />
        </div>
        <div className="mt-4">
          <label className="text-xs text-[var(--text-muted)] mb-1 block">
            Treść (text/plain). Użyj <code>{"{{brandName}}"}</code>,{" "}
            <code>{"{{supportEmail}}"}</code>, <code>{"{{recipient}}"}</code>,{" "}
            <code>{"{{actor}}"}</code> aby wstawiać dynamicznie.
          </label>
          <Textarea
            rows={10}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={send}
            loading={busy}
            disabled={!to.trim()}
            leftIcon={<Send className="w-4 h-4" />}
          >
            Wyślij
          </Button>
          <Button
            variant="ghost"
            leftIcon={<Eye className="w-4 h-4" />}
            onClick={() =>
              alert(
                "Podgląd HTML znajduje się w surowej formie po wysłaniu. Pełen wizualny preview wymagałby renderowania HTML w iframe — w wersji MVP wysyłamy plain text + auto-generowany prosty HTML.",
              )
            }
          >
            Co dostanie odbiorca?
          </Button>
        </div>
      </Card>

      <Card padding="md">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Lock className="w-4 h-4 text-[var(--text-muted)]" /> Konfiguracja
          gateway
        </h3>
        <p className="text-xs text-[var(--text-muted)]">
          SMTP_HOST + SMTP_USER + SMTP_PASSWORD są w envach dashboardu (Coolify
          → MyPerformance Dashboard). Aby zmienić skrzynkę przez którą wysyła
          dashboard, idź do zakładki „Postal", wygeneruj nowy klucz SMTP, i
          podstaw go w Coolify env.
        </p>
      </Card>
    </div>
  );
}
