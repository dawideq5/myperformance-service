"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Code2,
  ExternalLink,
  Eye,
  Info,
  Layers,
  Loader2,
  Lock,
  Mail,
  Palette,
  Power,
  Save,
  Search,
  Send,
  Server,
  Settings as SettingsIcon,
  Sparkles,
  X,
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

type TabId = "start" | "templates" | "layouts" | "smtp" | "branding" | "postal";

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
      { id: "start", label: "Start", icon: <Info className="w-5 h-5" /> },
      {
        id: "templates",
        label: "Szablony emaili",
        icon: <Mail className="w-5 h-5" />,
      },
      {
        id: "layouts",
        label: "Wygląd / layout",
        icon: <Layers className="w-5 h-5" />,
      },
      {
        id: "smtp",
        label: "Konfiguracje SMTP",
        icon: <SettingsIcon className="w-5 h-5" />,
      },
      {
        id: "branding",
        label: "Branding",
        icon: <Palette className="w-5 h-5" />,
      },
      {
        id: "postal",
        label: "Postal (infrastruktura)",
        icon: <Server className="w-5 h-5" />,
      },
    ],
    [],
  );

  const header = (
    <AppHeader
      backHref="/dashboard"
      title="Email — centralne zarządzanie"
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
          <TabPanel tabId="templates" active={tab === "templates"}>
            <TemplatesPanel />
          </TabPanel>
          <TabPanel tabId="layouts" active={tab === "layouts"}>
            <LayoutsPanel />
          </TabPanel>
          <TabPanel tabId="smtp" active={tab === "smtp"}>
            <SmtpConfigsPanel />
          </TabPanel>
          <TabPanel tabId="branding" active={tab === "branding"}>
            <BrandingPanel />
          </TabPanel>
          <TabPanel tabId="postal" active={tab === "postal"}>
            <PostalPanel />
          </TabPanel>
        </div>
      </div>
    </PageShell>
  );
}

// ── Start ───────────────────────────────────────────────────────────────────

function StartPanel({ onGoTo }: { onGoTo: (t: TabId) => void }) {
  return (
    <div className="space-y-3">
      <Card padding="lg">
        <h2 className="text-lg font-semibold text-[var(--text-main)] mb-2">
          Centralne zarządzanie emailem
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Wszystkie maile wysyłane przez stack — zebrane, edytowalne, z
          podglądem na żywo. Każda akcja ma swój szablon, który możesz
          dostosować lub wyłączyć.
        </p>
      </Card>

      <NavTile
        icon={<Mail className="w-5 h-5 text-emerald-400" />}
        title="Szablony emaili"
        description={'Lista wszystkich akcji w stacku. Każdy szablon: subject + treść + zmienne (wstaw przez „/"), live HTML preview, włącz/wyłącz, przypisz SMTP.'}
        cta="Otwórz szablony"
        onClick={() => onGoTo("templates")}
      />
      <NavTile
        icon={<Layers className="w-5 h-5 text-fuchsia-400" />}
        title="Wygląd / layout"
        description="Globalny szkielet maila — header MyPerformance, biel/czerń, slot {{content}} dla treści. Możesz mieć kilka wersji (np. transactional vs newsletter)."
        cta="Edytuj layout"
        onClick={() => onGoTo("layouts")}
      />
      <NavTile
        icon={<SettingsIcon className="w-5 h-5 text-amber-400" />}
        title="Konfiguracje SMTP"
        description='Aliasy: "transactional", "marketing" itp. Każdy szablon przypisujesz do aliasa — alias to host + login + nadawca. Tu zarządzasz wszystkimi.'
        cta="Konfiguruj SMTP"
        onClick={() => onGoTo("smtp")}
      />
      <NavTile
        icon={<Palette className="w-5 h-5 text-sky-400" />}
        title="Branding"
        description="Globalne dane marki (nazwa, logo, kolor) propagowane do envów aplikacji."
        cta="Edytuj branding"
        onClick={() => onGoTo("branding")}
      />
      <NavTile
        icon={<Server className="w-5 h-5 text-cyan-400" />}
        title="Postal (infrastruktura)"
        description="Niskopoziomowe zarządzanie naszym serwerem pocztowym Postal — organizacje, serwery, klucze, domeny."
        cta="Otwórz Postal"
        onClick={() => onGoTo("postal")}
      />
    </div>
  );
}

function NavTile({
  icon,
  title,
  description,
  cta,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <Card padding="md">
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-start gap-3 text-left"
      >
        <div className="p-2 rounded-lg bg-[var(--bg-main)] flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-main)]">
            {title}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--accent)]">
            {cta} <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </button>
    </Card>
  );
}

// ── Templates ───────────────────────────────────────────────────────────────

interface CatalogVariable {
  key: string;
  label: string;
  example: string;
  description: string;
  group: string;
}

type Editability = "full" | "kc-localization" | "external-link" | "readonly";

interface TemplateRow {
  actionKey: string;
  category: string;
  app: string;
  appLabel: string;
  name: string;
  description: string;
  editability: Editability;
  externalEditorUrl?: string;
  externalEditorLabel?: string;
  trigger: string;
  variables: CatalogVariable[];
  subject: string;
  body: string;
  enabled: boolean;
  layoutId: string | null;
  smtpConfigId: string | null;
  hasOverride: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  auth: "Autoryzacja",
  calendar: "Kalendarz",
  documents: "Dokumenty",
  support: "Obsługa klienta",
  academy: "Akademia",
  knowledge: "Knowledge",
  system: "System",
};

function TemplatesPanel() {
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ templates: TemplateRow[] }>(
        "/api/admin/email/templates",
      );
      setTemplates(r.templates);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!templates) return [];
    return templates.filter((t) => {
      if (categoryFilter && t.category !== categoryFilter) return false;
      if (filter) {
        const f = filter.toLowerCase();
        return (
          t.name.toLowerCase().includes(f) ||
          t.appLabel.toLowerCase().includes(f) ||
          t.actionKey.toLowerCase().includes(f)
        );
      }
      return true;
    });
  }, [templates, filter, categoryFilter]);

  const grouped = useMemo(() => {
    const out: Record<string, TemplateRow[]> = {};
    for (const t of filtered) {
      (out[t.category] ??= []).push(t);
    }
    return out;
  }, [filtered]);

  if (selected && templates) {
    const t = templates.find((x) => x.actionKey === selected);
    if (t) {
      return (
        <TemplateEditor
          template={t}
          onClose={() => {
            setSelected(null);
            void load();
          }}
        />
      );
    }
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex gap-3 items-start">
          <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-muted)]">
            Każdy mail wysyłany przez stack ma swój wpis. Kliknij dowolny żeby
            edytować treść lub wyłączyć wysyłkę. Badges po prawej stronie:
            <span className="ml-1">
              <Badge tone="success">edytowalne</Badge> — pełna edycja w naszym
              panelu,
            </span>
            <span className="ml-1">
              <Badge tone="warning">KC localization</Badge> — edytuj subject +
              treść; render robi Keycloak,
            </span>
            <span className="ml-1">
              <Badge tone="neutral">w aplikacji</Badge> — edycja w dedykowanym
              UI aplikacji,
            </span>
            <span className="ml-1">
              <Badge tone="danger">brak edycji</Badge> — hardcoded w kodzie.
            </span>
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card padding="md">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Szukaj akcji…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm"
            />
          </div>
          <select
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
            value={categoryFilter ?? ""}
            onChange={(e) => setCategoryFilter(e.target.value || null)}
          >
            <option value="">Wszystkie kategorie</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {!templates && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Ładowanie szablonów…
        </div>
      )}

      {Object.entries(grouped).map(([cat, list]) => (
        <Card key={cat} padding="md">
          <h3 className="text-sm font-semibold text-[var(--text-main)] mb-3">
            {CATEGORY_LABELS[cat] ?? cat}{" "}
            <span className="text-[var(--text-muted)] font-normal">
              ({list.length})
            </span>
          </h3>
          <div className="space-y-1.5">
            {list.map((t) => (
              <TemplateListItem
                key={t.actionKey}
                template={t}
                onClick={() => setSelected(t.actionKey)}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function TemplateListItem({
  template,
  onClick,
}: {
  template: TemplateRow;
  onClick: () => void;
}) {
  const editabilityBadge = () => {
    switch (template.editability) {
      case "full":
        return <Badge tone="success">edytowalne</Badge>;
      case "kc-localization":
        return <Badge tone="warning">KC localization</Badge>;
      case "external-link":
        return <Badge tone="neutral">w aplikacji</Badge>;
      case "readonly":
        return <Badge tone="danger">brak edycji</Badge>;
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-surface)] transition"
    >
      <div className="flex items-center gap-3 min-w-0">
        {!template.enabled && (
          <span title="Wyłączone — nie wysyła">
            <Power className="w-4 h-4 text-red-400" />
          </span>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--text-main)] truncate">
            {template.name}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] truncate">
            {template.appLabel}
            {template.hasOverride ? " · zmodyfikowany" : ""}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {editabilityBadge()}
        <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
      </div>
    </button>
  );
}

// ── Template Editor ─────────────────────────────────────────────────────────

interface SmtpConfigOpt {
  id: string;
  alias: string;
  label: string;
  isDefault: boolean;
}

interface LayoutOpt {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
}

function TemplateEditor({
  template,
  onClose,
}: {
  template: TemplateRow;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [enabled, setEnabled] = useState(template.enabled);
  const [layoutId, setLayoutId] = useState<string | null>(template.layoutId);
  const [smtpConfigId, setSmtpConfigId] = useState<string | null>(
    template.smtpConfigId,
  );
  const [layouts, setLayouts] = useState<LayoutOpt[]>([]);
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfigOpt[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showTestSend, setShowTestSend] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [pickerState, setPickerState] = useState<PickerState>(EMPTY_PICKER_STATE);
  const slashHandle = useRef<SlashTextareaHandle | null>(null);

  const editable =
    template.editability === "full" ||
    template.editability === "kc-localization";

  // Load options
  useEffect(() => {
    void api
      .get<{ layouts: LayoutOpt[] }>("/api/admin/email/layouts")
      .then((r) => setLayouts(r.layouts));
    void api
      .get<{ configs: SmtpConfigOpt[] }>("/api/admin/email/smtp-configs")
      .then((r) => setSmtpConfigs(r.configs));
  }, []);

  // Live preview — debounce 600ms after edit
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editable) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const r = await api.post<
          { subject: string; html: string; text: string },
          { draftSubject: string; draftBody: string; layoutId: string | null }
        >(
          `/api/admin/email/templates/${encodeURIComponent(template.actionKey)}/preview`,
          { draftSubject: subject, draftBody: body, layoutId },
        );
        setPreviewHtml(r.html);
        setPreviewSubject(r.subject);
      } catch (err) {
        setError(
          err instanceof ApiRequestError ? err.message : "Preview failed",
        );
      } finally {
        setPreviewLoading(false);
      }
    }, 600);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [subject, body, layoutId, template.actionKey, editable]);

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.patch(
        `/api/admin/email/templates/${encodeURIComponent(template.actionKey)}`,
        { subject, body, enabled, layoutId, smtpConfigId },
      );
      setNotice("Zapisane. Następne maile użyją tej treści.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetToDefault() {
    setBusy(true);
    setError(null);
    try {
      await api.delete(
        `/api/admin/email/templates/${encodeURIComponent(template.actionKey)}`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Reset failed");
    } finally {
      setBusy(false);
      setShowResetConfirm(false);
    }
  }

  // ── Non-editable views ──────────────────────────────────────────────────
  if (template.editability === "readonly") {
    return (
      <NonEditableView
        template={template}
        onClose={onClose}
        message="Treść tego szablonu jest hardkodowana w kodzie aplikacji i nie może być edytowana z naszego dashboardu. Zmiana wymagałaby forka kodu źródłowego aplikacji."
      />
    );
  }

  if (template.editability === "external-link") {
    return (
      <NonEditableView
        template={template}
        onClose={onClose}
        message="Edycja możliwa w dedykowanym interfejsie aplikacji."
        externalUrl={template.externalEditorUrl}
        externalLabel={template.externalEditorLabel}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<X className="w-4 h-4" />}
              onClick={onClose}
            >
              Wróć do listy
            </Button>
            <h2 className="text-lg font-semibold text-[var(--text-main)] mt-2">
              {template.name}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              <strong>{template.appLabel}</strong> · {template.description}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Trigger: {template.trigger}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4"
              />
              <span
                className={enabled ? "text-emerald-400" : "text-red-400"}
              >
                {enabled ? "Aktywny — wysyła" : "Wyłączony — nie wysyła"}
              </span>
            </label>
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* LEFT: Editor */}
        <div className="space-y-3">
          <Card padding="md">
            <label className="text-xs text-[var(--text-muted)] block mb-1">
              Temat wiadomości
            </label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Temat z możliwością wstawiania zmiennych"
            />
          </Card>

          <Card padding="md">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-[var(--text-muted)]">
                Treść (markdown + zmienne — wpisz &bdquo;/&rdquo; aby wstawić)
              </label>
              <span className="text-[10px] text-[var(--text-muted)]">
                Linki: [tekst](url) · pogrubienie: **tekst** · listy: • elem
              </span>
            </div>
            <SlashTextarea
              value={body}
              onChange={setBody}
              variables={template.variables}
              rows={18}
              onPickerStateChange={setPickerState}
              handleRef={slashHandle}
            />
          </Card>

          <Card padding="md">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-1">
                  Layout (szkielet HTML)
                </label>
                <select
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                  value={layoutId ?? ""}
                  onChange={(e) => setLayoutId(e.target.value || null)}
                >
                  <option value="">— domyślny —</option>
                  {layouts.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-1">
                  SMTP — przez którą skrzynkę wysyłać
                </label>
                <select
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                  value={smtpConfigId ?? ""}
                  onChange={(e) => setSmtpConfigId(e.target.value || null)}
                >
                  <option value="">— domyślny (transactional) —</option>
                  {smtpConfigs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                      {s.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={save}
              loading={busy}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Zapisz
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowTestSend(true)}
              leftIcon={<Send className="w-4 h-4" />}
            >
              Wyślij testowo
            </Button>
            {template.hasOverride && (
              <Button
                variant="ghost"
                onClick={() => setShowResetConfirm(true)}
                disabled={busy}
              >
                Przywróć domyślne
              </Button>
            )}
          </div>
        </div>

        {/* RIGHT: Variable picker (gdy aktywny) ALBO live preview (default) */}
        <div className="space-y-3">
          {pickerState.open ? (
            <VariablePickerPanel
              state={pickerState}
              onPick={(v) => slashHandle.current?.insertVariable(v)}
              onHighlight={(idx) =>
                slashHandle.current?.setHighlightedIdx(idx)
              }
              onClose={() => slashHandle.current?.closePicker()}
            />
          ) : (
            <Card padding="md" className="h-fit">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[var(--accent)]" />
                  Podgląd na żywo
                </h3>
                {previewLoading && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)]" />
                )}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mb-3">
                <strong>Temat:</strong> {previewSubject || subject}
              </div>
              <div className="rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-white">
                <iframe
                  title="Email preview"
                  srcDoc={previewHtml}
                  className="w-full"
                  style={{ height: "720px", border: "none", background: "#fff" }}
                  sandbox="allow-same-origin"
                />
              </div>
            </Card>
          )}
        </div>
      </div>

      {showResetConfirm && (
        <ConfirmDialog
          title="Przywróć domyślną treść?"
          description="Twoja edycja zostanie usunięta. Następne maile użyją oryginalnej treści (z katalogu)."
          onConfirm={resetToDefault}
          onCancel={() => setShowResetConfirm(false)}
          confirmLabel="Przywróć"
          confirmVariant="danger"
        />
      )}

      {showTestSend && (
        <TestSendDialog
          actionKey={template.actionKey}
          draftSubject={subject}
          draftBody={body}
          layoutId={layoutId}
          smtpConfigId={smtpConfigId}
          onClose={() => setShowTestSend(false)}
        />
      )}
    </div>
  );
}

// ── Slash command picker (split: textarea + zewnętrzny picker UI) ───────────

interface PickerState {
  open: boolean;
  query: string;
  filtered: CatalogVariable[];
  highlightedIdx: number;
}

const EMPTY_PICKER_STATE: PickerState = {
  open: false,
  query: "",
  filtered: [],
  highlightedIdx: 0,
};

interface SlashTextareaHandle {
  insertVariable: (v: CatalogVariable) => void;
  closePicker: () => void;
  setHighlightedIdx: (idx: number) => void;
}

const SlashTextarea = function SlashTextarea({
  value,
  onChange,
  variables,
  rows,
  onPickerStateChange,
  handleRef,
}: {
  value: string;
  onChange: (v: string) => void;
  variables: CatalogVariable[];
  rows: number;
  onPickerStateChange: (state: PickerState) => void;
  handleRef?: React.MutableRefObject<SlashTextareaHandle | null>;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [startIndex, setStartIndex] = useState(-1);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return variables;
    return variables.filter(
      (v) =>
        v.key.toLowerCase().includes(q) ||
        v.label.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q),
    );
  }, [variables, query]);

  // Reset highlighted gdy filtered się zmienia.
  useEffect(() => {
    setHighlightedIdx(0);
  }, [query]);

  // Publikuj stan picker'a do parenta — ten renderuje UI w prawej kolumnie.
  useEffect(() => {
    onPickerStateChange({ open, query, filtered, highlightedIdx });
  }, [open, query, filtered, highlightedIdx, onPickerStateChange]);

  function detectPicker(newValue: string, cursor: number) {
    let i = cursor - 1;
    while (i >= 0) {
      const ch = newValue[i];
      if (ch === "/") {
        const before = i === 0 ? "" : newValue[i - 1];
        if (i === 0 || /\s/.test(before)) {
          setOpen(true);
          setStartIndex(i);
          setQuery(newValue.slice(i + 1, cursor));
          return;
        }
      }
      if (/\s/.test(newValue[i])) break;
      i--;
    }
    setOpen(false);
    setStartIndex(-1);
    setQuery("");
  }

  function handleChange(newValue: string) {
    onChange(newValue);
    const ta = taRef.current;
    if (!ta) return;
    detectPicker(newValue, ta.selectionStart);
  }

  function insertVariable(v: CatalogVariable) {
    const ta = taRef.current;
    if (!ta || startIndex < 0) return;
    const cursor = ta.selectionStart;
    const before = value.slice(0, startIndex);
    const after = value.slice(cursor);
    const insertion = `{{${v.key}}}`;
    const newValue = before + insertion + after;
    onChange(newValue);
    setOpen(false);
    setStartIndex(-1);
    setQuery("");
    setTimeout(() => {
      const newPos = before.length + insertion.length;
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }

  function closePicker() {
    setOpen(false);
    setStartIndex(-1);
    setQuery("");
    taRef.current?.focus();
  }

  // Imperative handle do parenta — używane przez kliknięcie myszą w pickerze.
  if (handleRef) {
    handleRef.current = {
      insertVariable,
      closePicker,
      setHighlightedIdx,
    };
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closePicker();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      if (filtered[highlightedIdx]) {
        e.preventDefault();
        insertVariable(filtered[highlightedIdx]);
      }
      return;
    }
  }

  return (
    <Textarea
      ref={taRef as React.Ref<HTMLTextAreaElement>}
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      onKeyDown={handleKeyDown}
      rows={rows}
      className="font-mono text-sm"
    />
  );
};

/** Panel wyboru zmiennej — renderowany w prawej kolumnie zamiast preview. */
function VariablePickerPanel({
  state,
  onPick,
  onHighlight,
  onClose,
}: {
  state: PickerState;
  onPick: (v: CatalogVariable) => void;
  onHighlight: (idx: number) => void;
  onClose: () => void;
}) {
  const grouped = useMemo(() => {
    const out: Record<string, CatalogVariable[]> = {};
    for (const v of state.filtered) {
      (out[v.group] ??= []).push(v);
    }
    return out;
  }, [state.filtered]);

  return (
    <Card padding="md" className="border-[var(--accent)]/40">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Search className="w-4 h-4 text-[var(--accent)]" />
          Wstaw zmienną
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          leftIcon={<X className="w-3.5 h-3.5" />}
        >
          Zamknij
        </Button>
      </div>
      <div className="text-[11px] text-[var(--text-muted)] mb-3">
        Wpisuj dalej w polu treści aby filtrować · <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[10px]">↑↓</kbd> nawigacja · <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[10px]">Enter</kbd> wstawia · <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[10px]">Esc</kbd> anuluje
      </div>
      {state.query && (
        <div className="text-[11px] text-[var(--text-muted)] mb-2">
          Filtr: <code className="text-[var(--accent)]">{state.query}</code>
          {state.filtered.length === 0 && " · brak dopasowań"}
        </div>
      )}
      <div className="max-h-[640px] overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        {state.filtered.length === 0 ? (
          <div className="p-4 text-xs text-[var(--text-muted)]">
            Brak zmiennych pasujących do filtra. Skasuj wpisany tekst po
            ukośniku albo naciśnij Esc, aby zamknąć picker.
          </div>
        ) : (
          Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="px-3 py-1.5 text-[10px] uppercase text-[var(--text-muted)] bg-[var(--bg-main)] border-b border-[var(--border-subtle)] sticky top-0">
                {group}
              </div>
              {items.map((v) => {
                const idx = state.filtered.indexOf(v);
                const highlighted = idx === state.highlightedIdx;
                return (
                  <button
                    key={v.key}
                    type="button"
                    onMouseEnter={() => onHighlight(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onPick(v);
                    }}
                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 border-b border-[var(--border-subtle)]/50 ${
                      highlighted
                        ? "bg-[var(--accent)]/10"
                        : "hover:bg-[var(--bg-main)]"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[var(--text-main)] truncate">
                        {v.label}
                      </div>
                      <code className="text-[10px] text-[var(--text-muted)] block truncate">
                        {`{{${v.key}}}`}
                      </code>
                      {v.description && (
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
                          {v.description}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] flex-shrink-0 max-w-[140px] truncate">
                      <span className="opacity-60">np. </span>
                      {v.example}
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

// ── Non-editable view ───────────────────────────────────────────────────────

function NonEditableView({
  template,
  onClose,
  message,
  externalUrl,
  externalLabel,
}: {
  template: TemplateRow;
  onClose: () => void;
  message: string;
  externalUrl?: string;
  externalLabel?: string;
}) {
  return (
    <Card padding="lg">
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<X className="w-4 h-4" />}
        onClick={onClose}
      >
        Wróć do listy
      </Button>
      <div className="mt-4 flex items-start gap-4">
        <div className="p-3 rounded-lg bg-amber-500/10 flex-shrink-0">
          <Lock className="w-6 h-6 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            {template.name}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            <strong>{template.appLabel}</strong> · {template.description}
          </p>
          <Alert tone="warning" className="mt-4">
            {message}
          </Alert>
          {externalUrl && externalLabel && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--accent)] hover:underline"
            >
              {externalLabel} <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <div className="mt-6 text-xs text-[var(--text-muted)]">
            <strong>Kiedy się wysyła:</strong> {template.trigger}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Test send dialog ────────────────────────────────────────────────────────

function TestSendDialog({
  actionKey,
  draftSubject,
  draftBody,
  layoutId,
  smtpConfigId,
  onClose,
}: {
  actionKey: string;
  draftSubject: string;
  draftBody: string;
  layoutId: string | null;
  smtpConfigId: string | null;
  onClose: () => void;
}) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ messageId: string }, {
        to: string;
        draftSubject: string;
        draftBody: string;
        layoutId: string | null;
        smtpConfigId: string | null;
      }>(
        `/api/admin/email/templates/${encodeURIComponent(actionKey)}/send-test`,
        { to, draftSubject, draftBody, layoutId, smtpConfigId },
      );
      setDone(`Wysłane (id: ${r.messageId}). Sprawdź skrzynkę ${to}.`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <Card padding="lg" className="w-full max-w-md">
        <h3 className="text-base font-semibold mb-2">Wyślij testowo</h3>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Wysyła aktualną treść (z niezapisanych zmian) na podany adres.
          Zmienne wypełniane są przykładami z katalogu.
        </p>
        {error && <Alert tone="error" className="mb-3">{error}</Alert>}
        {done && <Alert tone="success" className="mb-3">{done}</Alert>}
        <Input
          label="Adres odbiorcy"
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="ty@example.com"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Zamknij
          </Button>
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
    </div>
  );
}

// ── Confirm dialog ──────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  description,
  onConfirm,
  onCancel,
  confirmLabel,
  confirmVariant,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <Card padding="lg" className="w-full max-w-md">
        <h3 className="text-base font-semibold mb-2">{title}</h3>
        <p className="text-sm text-[var(--text-muted)] mb-5">{description}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Anuluj
          </Button>
          <Button
            onClick={onConfirm}
            className={
              confirmVariant === "danger"
                ? "bg-red-500/90 hover:bg-red-500 border-red-600"
                : ""
            }
          >
            {confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ── Layouts panel ───────────────────────────────────────────────────────────

interface LayoutFull {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  html: string;
  isDefault: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

function LayoutsPanel() {
  const [layouts, setLayouts] = useState<LayoutFull[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ layouts: LayoutFull[] }>(
        "/api/admin/email/layouts",
      );
      setLayouts(r.layouts);
      if (!selected && r.layouts[0]) setSelected(r.layouts[0].id);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
  }, [selected]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = layouts.find((l) => l.id === selected);

  const [draftHtml, setDraftHtml] = useState("");
  const [draftName, setDraftName] = useState("");
  useEffect(() => {
    if (current) {
      setDraftHtml(current.html);
      setDraftName(current.name);
    }
  }, [current]);

  async function save() {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await api.post<{ layout: LayoutFull }, {
        slug: string;
        name: string;
        html: string;
        isDefault: boolean;
        description: string | null;
      }>("/api/admin/email/layouts", {
        slug: current.slug,
        name: draftName,
        html: draftHtml,
        isDefault: current.isDefault,
        description: current.description,
      });
      setNotice("Layout zapisany.");
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Save failed");
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
            Layout to globalny szkielet HTML — header MyPerformance, slot{" "}
            <code>{"{{content}}"}</code> dla treści, footer. Każdy szablon
            renderowany jest wewnątrz wybranego layoutu. Możesz edytować HTML
            bezpośrednio (TIP: testuj na małych zmianach — zły HTML łamie wszystkie
            maile).
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card padding="md">
        <div className="flex gap-2 flex-wrap">
          {layouts.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setSelected(l.id)}
              className={`px-3 py-1.5 text-xs rounded-lg border ${
                selected === l.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--border-subtle)]"
              }`}
            >
              {l.name}
              {l.isDefault && <span className="ml-1 opacity-60">★</span>}
            </button>
          ))}
        </div>
      </Card>

      {current && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card padding="md">
            <Input
              label="Nazwa layoutu"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
            <label className="text-xs text-[var(--text-muted)] block mt-3 mb-1">
              HTML (z slotem <code>{"{{content}}"}</code> dla treści)
            </label>
            <Textarea
              rows={28}
              value={draftHtml}
              onChange={(e) => setDraftHtml(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="mt-3 flex gap-2">
              <Button
                onClick={save}
                loading={busy}
                leftIcon={<Save className="w-4 h-4" />}
              >
                Zapisz
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (current) {
                    setDraftHtml(current.html);
                    setDraftName(current.name);
                  }
                }}
              >
                Cofnij
              </Button>
            </div>
          </Card>
          <Card padding="md">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
              <Eye className="w-4 h-4 text-[var(--accent)]" />
              Podgląd (z przykładową treścią)
            </h3>
            <div className="rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-white">
              <iframe
                title="Layout preview"
                srcDoc={draftHtml.replace(
                  "{{content}}",
                  '<p>Cześć Anna,</p><p>To jest przykładowa treść maila wyświetlana w layoutcie. <strong>Pogrubienie</strong>, <a href="#">link</a>, listy itd.</p><div class="button-container" style="text-align:center;margin:32px 0 8px 0;"><a href="#" class="button" style="display:inline-block;padding:14px 28px;background-color:#0c0c0e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Przykładowy CTA</a></div>',
                ).replace(/\{\{brand\.name\}\}/g, "MyPerformance")
                  .replace(/\{\{brand\.url\}\}/g, "https://myperformance.pl")
                  .replace(/\{\{brand\.supportEmail\}\}/g, "support@myperformance.pl")
                  .replace(/\{\{subject\}\}/g, "Przykładowy temat")}
                className="w-full"
                style={{ height: "720px", border: "none" }}
                sandbox="allow-same-origin"
              />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── SMTP Configs panel ──────────────────────────────────────────────────────

interface SmtpConfigFull {
  id: string;
  alias: string;
  label: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string | null;
  smtpPassword: string | null;
  useTls: boolean;
  fromEmail: string;
  fromDisplay: string | null;
  replyTo: string | null;
  postalServerId: number | null;
  isDefault: boolean;
}

function SmtpConfigsPanel() {
  const [configs, setConfigs] = useState<SmtpConfigFull[]>([]);
  const [editing, setEditing] = useState<Partial<SmtpConfigFull> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ configs: SmtpConfigFull[] }>(
        "/api/admin/email/smtp-configs",
      );
      setConfigs(r.configs);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post("/api/admin/email/smtp-configs", editing);
      setNotice("Zapisane.");
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Save failed");
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
            Aliasy SMTP (np. <code>transactional</code>, <code>marketing</code>) to
            nazwy logiczne. Każdy szablon przypisujesz do aliasa — dzięki temu
            możesz zmienić skrzynkę nadawczą dla wszystkich maili tego typu w
            jednym miejscu.
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid gap-2">
        {configs.map((c) => (
          <Card key={c.id} padding="md">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  {c.label}
                  {c.isDefault && <Badge tone="success">domyślny</Badge>}
                </div>
                <code className="text-[10px] text-[var(--text-muted)]">
                  {c.alias} · {c.smtpHost}:{c.smtpPort} · {c.fromEmail}
                </code>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(c)}
              >
                Edytuj
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Button
        onClick={() =>
          setEditing({
            alias: "",
            label: "",
            smtpHost: "smtp-iut9wf1rz9ey54g7lbkje0je",
            smtpPort: 25,
            useTls: false,
            fromEmail: "noreply@myperformance.pl",
            fromDisplay: "MyPerformance",
            isDefault: false,
          })
        }
      >
        + Dodaj nową konfigurację
      </Button>

      {editing && (
        <Card padding="lg" className="border-[var(--accent)]">
          <h3 className="text-sm font-semibold mb-3">
            {editing.alias ? `Edycja: ${editing.alias}` : "Nowa konfiguracja"}
          </h3>
          <div className="grid md:grid-cols-2 gap-3">
            <Input
              label="Alias (slug, identyfikator)"
              value={editing.alias ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, alias: e.target.value })
              }
              placeholder="transactional"
            />
            <Input
              label="Etykieta (ludzka nazwa)"
              value={editing.label ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, label: e.target.value })
              }
              placeholder="Transactional (Postal)"
            />
            <Input
              label="SMTP host"
              value={editing.smtpHost ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, smtpHost: e.target.value })
              }
            />
            <Input
              label="SMTP port"
              type="number"
              value={String(editing.smtpPort ?? 25)}
              onChange={(e) =>
                setEditing({ ...editing, smtpPort: Number(e.target.value) })
              }
            />
            <Input
              label="SMTP user"
              value={editing.smtpUser ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, smtpUser: e.target.value })
              }
            />
            <Input
              label="SMTP password (zostaw puste żeby nie zmieniać)"
              type="password"
              value={editing.smtpPassword === "***" ? "" : editing.smtpPassword ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, smtpPassword: e.target.value })
              }
              placeholder={editing.smtpPassword === "***" ? "(istniejące hasło)" : ""}
            />
            <Input
              label="From email (adres nadawcy)"
              value={editing.fromEmail ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, fromEmail: e.target.value })
              }
            />
            <Input
              label="From display (nazwa nadawcy)"
              value={editing.fromDisplay ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, fromDisplay: e.target.value })
              }
            />
            <Input
              label="Reply-To (opcjonalny)"
              value={editing.replyTo ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, replyTo: e.target.value })
              }
            />
            <label className="flex items-center gap-2 text-xs cursor-pointer mt-6">
              <input
                type="checkbox"
                checked={editing.useTls ?? false}
                onChange={(e) =>
                  setEditing({ ...editing, useTls: e.target.checked })
                }
              />
              Wymaga TLS (zazwyczaj port 465)
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={editing.isDefault ?? false}
                onChange={(e) =>
                  setEditing({ ...editing, isDefault: e.target.checked })
                }
              />
              Ustaw jako domyślny (używany dla szablonów bez przypisanego SMTP)
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={save} loading={busy} leftIcon={<Save className="w-4 h-4" />}>
              Zapisz
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Anuluj
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Branding (zachowane jak było, lekko uproszczone) ────────────────────────

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

function BrandingPanel() {
  const [data, setData] = useState<Branding | null>(null);
  const [draft, setDraft] = useState<Partial<Branding>>({});
  const [busy, setBusy] = useState(false);
  const [propagating, setPropagating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.get<{ branding: Branding }>(
        "/api/admin/email/branding",
      );
      setData(r.branding);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      const r = await api.put<{ branding: Branding }, Partial<Branding>>(
        "/api/admin/email/branding",
        draft,
      );
      setData(r.branding);
      setDraft({});
      setNotice('Branding zapisany. Kliknij „Propaguj" aby wysłać do apek.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function propagate() {
    if (!confirm("Propagacja zaktualizuje envy w 6 aplikacjach. Apki Documenso + Dashboard wymagają redeployu (~5 min). Kontynuować?")) return;
    setPropagating(true);
    setError(null);
    try {
      await api.post(
        "/api/admin/email/branding/propagate",
        { applyRedeploy: true },
      );
      setNotice("Propagacja zakończona. Apki podchwycą zmiany w ciągu kilku minut.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Propagate failed");
    } finally {
      setPropagating(false);
    }
  }

  if (!data) {
    return (
      <Card padding="lg">
        {error ? <Alert tone="error">{error}</Alert> : (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" /> Ładowanie…
          </div>
        )}
      </Card>
    );
  }

  const merged = { ...data, ...draft };
  const dirty = Object.keys(draft).length > 0;

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card padding="lg">
        <CardHeader
          icon={<Palette className="w-6 h-6 text-[var(--accent)]" />}
          title="Globalne dane marki"
          description="Te zmienne lecą jako env do każdej apki. Apka renderuje je w mailach i UI."
        />
        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <Input label="Nazwa marki *" value={merged.brandName ?? ""} onChange={(e) => setDraft({ ...draft, brandName: e.target.value })} />
          <Input label="URL strony" value={merged.brandUrl ?? ""} onChange={(e) => setDraft({ ...draft, brandUrl: e.target.value })} />
          <Input label="Logo URL" value={merged.brandLogoUrl ?? ""} onChange={(e) => setDraft({ ...draft, brandLogoUrl: e.target.value })} />
          <Input label="Kolor (hex)" value={merged.primaryColor ?? ""} onChange={(e) => setDraft({ ...draft, primaryColor: e.target.value })} />
          <Input label="Support email" value={merged.supportEmail ?? ""} onChange={(e) => setDraft({ ...draft, supportEmail: e.target.value })} />
          <Input label="Pełna nazwa firmy" value={merged.legalName ?? ""} onChange={(e) => setDraft({ ...draft, legalName: e.target.value })} />
          <Input label="From display" value={merged.fromDisplay ?? ""} onChange={(e) => setDraft({ ...draft, fromDisplay: e.target.value })} />
          <Input label="Reply-To" value={merged.replyTo ?? ""} onChange={(e) => setDraft({ ...draft, replyTo: e.target.value })} />
        </div>
        <div className="mt-6 flex gap-2 flex-wrap">
          <Button onClick={save} loading={busy} disabled={!dirty} leftIcon={<Save className="w-4 h-4" />}>
            {dirty ? "Zapisz" : "Brak zmian"}
          </Button>
          <Button onClick={propagate} loading={propagating} leftIcon={<Sparkles className="w-4 h-4" />}>
            Propaguj do aplikacji
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ── Postal panel (uproszczony) ──────────────────────────────────────────────

interface PostalOrg {
  id: number;
  name: string;
  permalink: string;
  serverCount: number;
}
interface PostalServer {
  id: number;
  organizationId: number;
  organizationName: string;
  name: string;
  mode: string;
  postmasterAddress: string | null;
}
interface PostalCred {
  id: number;
  type: string;
  name: string;
  key: string;
}
interface PostalDomainRow {
  id: number;
  name: string;
  spfStatus: string | null;
  dkimStatus: string | null;
  mxStatus: string | null;
  returnPathStatus: string | null;
}

function PostalPanel() {
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
        api.get<{ organizations: PostalOrg[]; configured: boolean }>("/api/admin/email/postal/organizations"),
        api.get<{ servers: PostalServer[] }>("/api/admin/email/postal/servers"),
        api.get<{ domains: PostalDomainRow[] }>("/api/admin/email/postal/domains"),
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
      .get<{ credentials: PostalCred[] }>(`/api/admin/email/postal/servers/${selServer}/credentials`)
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
            <strong> &bdquo;Konfiguracje SMTP&rdquo;</strong>. Tutaj tworzysz nowe organizacje,
            serwery, generujesz klucze SMTP/API.
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card padding="md">
        <h3 className="text-sm font-semibold mb-1">Domeny — status DNS</h3>
        <p className="text-[11px] text-[var(--text-muted)] mb-3">
          SPF i DKIM muszą być OK żeby maile docierały (deliverability). MX
          to gdzie kierowane są maile <strong>przychodzące</strong> — jeśli
          nasz Postal odbiera tylko outgoing (typowy setup), MX wskazuje na
          inne serwery i Postal pokazuje status <em>info</em> (nie błąd).
        </p>
        <div className="grid gap-2">
          {domains.map((d) => {
            const sendingOk = d.spfStatus === "OK" && d.dkimStatus === "OK";
            return (
              <div key={d.id} className="text-xs border border-[var(--border-subtle)] rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{d.name}</span>
                    {sendingOk && <Badge tone="success">wysyłka OK</Badge>}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Badge tone={d.spfStatus === "OK" ? "success" : "warning"} title="Sender Policy Framework — autoryzuje nasz Postal do wysyłania w imieniu domeny">SPF: {d.spfStatus ?? "?"}</Badge>
                    <Badge tone={d.dkimStatus === "OK" ? "success" : "warning"} title="DKIM — kryptograficzny podpis maila, krytyczny dla deliverability">DKIM: {d.dkimStatus ?? "?"}</Badge>
                    <Badge tone={d.mxStatus === "OK" ? "success" : "neutral"} title="MX — gdzie odbierane są maile przychodzące">MX: {d.mxStatus ?? "?"}</Badge>
                    <Badge tone={d.returnPathStatus === "OK" ? "success" : "warning"} title="Return-Path — adres bounces; wpływa na deliverability">Return-Path: {d.returnPathStatus ?? "?"}</Badge>
                  </div>
                </div>
                {!sendingOk && (
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                    SPF lub DKIM brakuje — to wymaga DODANIA brakujących
                    rekordów DNS w panelu domeny. Bez tego maile będą lądować
                    w spamie. Szczegóły rekordów (kopiuj-wklej):{" "}
                    <a href="https://postal.myperformance.pl" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">postal.myperformance.pl</a>
                  </p>
                )}
                {sendingOk && d.mxStatus !== "OK" && (
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                    <strong>Wysyłka działa</strong> (SPF + DKIM OK). Status MX
                    wskazuje że <em>maile przychodzące</em> idą do innego
                    serwera (np. OVH, Google Workspace). To poprawne dla
                    setupu &bdquo;outgoing-only&rdquo;. Aby odbierać przez Postal — zmień
                    rekordy MX domeny aby wskazywały na ten serwer.
                  </p>
                )}
                {sendingOk && d.returnPathStatus !== "OK" && (
                  <p className="mt-2 text-[11px] text-amber-300">
                    <strong>Brak Return-Path:</strong> dodaj CNAME{" "}
                    <code className="bg-[var(--bg-main)] px-1 rounded">psrp.{d.name}</code> →{" "}
                    <code className="bg-[var(--bg-main)] px-1 rounded">psrp.postal.myperformance.pl</code>{" "}
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
                {servers.filter((s) => s.organizationId === o.id).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelServer(selServer === s.id ? null : s.id)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg border ${selServer === s.id ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border-subtle)]"}`}
                  >
                    {s.name} <span className="text-[var(--text-muted)]">· {s.mode}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {selServer != null && (
        <Card padding="md">
          <h3 className="text-sm font-semibold mb-2">Skrzynki (klucze SMTP/API) na serwerze</h3>
          <div className="space-y-1.5">
            {creds.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs px-3 py-2 rounded bg-[var(--bg-main)]">
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
              <p className="text-[11px] text-[var(--text-muted)]">Brak skrzynek na tym serwerze.</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
