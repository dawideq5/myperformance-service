"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileSignature,
  FileText,
  Filter,
  Inbox,
  LayoutGrid,
  Mail,
  RefreshCw,
  Search,
  Send,
  Settings,
  Trash2,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  Input,
  Select,
  Tabs,
  Textarea,
  type TabItem,
} from "@/components/ui";
import type {
  DocusealSubmissionSummary,
  DocusealTemplateSummary,
  SubmissionStats,
} from "@/lib/docuseal";

type Tab = "overview" | "send" | "templates" | "submissions" | "people" | "settings";

interface EmployeeRow {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  roles: string[];
  lastActiveAt?: number;
  online: boolean;
}

export function ObiegClient({
  initialTemplates,
  initialSubmissions,
  initialStats,
  configured,
  docusealUrl,
  isAdmin,
}: {
  initialTemplates: DocusealTemplateSummary[];
  initialSubmissions: DocusealSubmissionSummary[];
  initialStats: SubmissionStats;
  configured: boolean;
  docusealUrl: string | null;
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [templates, setTemplates] = useState(initialTemplates);
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [stats, setStats] = useState(initialStats);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; msg: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [people, setPeople] = useState<EmployeeRow[]>([]);
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [realtime, setRealtime] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const [t, s] = await Promise.all([
        fetch("/api/templates").then((r) => (r.ok ? r.json() : { templates: [] })),
        fetch("/api/submissions").then((r) => (r.ok ? r.json() : { submissions: [] })),
      ]);
      if (Array.isArray(t.templates)) setTemplates(t.templates);
      if (Array.isArray(s.submissions)) {
        setSubmissions(s.submissions);
        const stats = await fetch("/api/stats").then((r) => r.json()).catch(() => null);
        if (stats?.stats) setStats(stats.stats);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    const es = new EventSource("/api/events");
    es.addEventListener("ready", () => setRealtime(true));
    const handler = () => void reload();
    for (const evt of [
      "submission.created",
      "submission.completed",
      "submission.declined",
      "submission.expired",
      "submitter.opened",
      "submitter.signed",
      "template.created",
      "template.updated",
      "state.refresh",
    ]) {
      es.addEventListener(evt, handler);
    }
    es.onerror = () => setRealtime(false);
    return () => es.close();
  }, [configured, reload]);

  useEffect(() => {
    if (tab !== "people" || peopleLoaded) return;
    (async () => {
      const res = await fetch("/api/users?role=all").then((r) => (r.ok ? r.json() : null));
      if (res?.users) setPeople(res.users);
      setPeopleLoaded(true);
    })();
  }, [tab, peopleLoaded]);

  const refreshPeople = useCallback(async () => {
    const res = await fetch("/api/users?role=all").then((r) => (r.ok ? r.json() : null));
    if (res?.users) setPeople(res.users);
  }, []);

  const tabs = useMemo<TabItem<Tab>[]>(() => {
    const base: TabItem<Tab>[] = [
      { id: "overview", label: "Przegląd", icon: <LayoutGrid className="w-4 h-4" /> },
      { id: "send", label: "Wyślij", icon: <Send className="w-4 h-4" /> },
      {
        id: "templates",
        label: "Szablony",
        icon: <FileText className="w-4 h-4" />,
        badge: templates.length,
      },
      {
        id: "submissions",
        label: "Wysyłki",
        icon: <Inbox className="w-4 h-4" />,
        badge: submissions.length,
      },
      {
        id: "people",
        label: "Pracownicy",
        icon: <Users className="w-4 h-4" />,
        badge: people.filter((p) => p.online).length || undefined,
      },
    ];
    if (isAdmin) base.push({ id: "settings", label: "Webhooki", icon: <Settings className="w-4 h-4" /> });
    return base;
  }, [templates.length, submissions.length, people, isAdmin]);

  return (
    <div className="space-y-5">
      {notice ? (
        <Alert tone={notice.tone === "success" ? "success" : notice.tone === "error" ? "error" : "info"}>
          {notice.msg}
        </Alert>
      ) : null}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs items={tabs} active={tab} onChange={setTab} />
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 text-xs text-slate-400"
            title={realtime ? "Realtime aktywny" : "Realtime rozłączony"}
          >
            <span
              className={`w-2 h-2 rounded-full ${realtime ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`}
            />
            {realtime ? "Realtime" : "Offline"}
          </span>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />}
            onClick={() => void reload()}
            disabled={!configured}
          >
            Odśwież
          </Button>
        </div>
      </div>

      {tab === "overview" && (
        <OverviewTab
          stats={stats}
          submissions={submissions}
          templates={templates}
          docusealUrl={docusealUrl}
          onJumpSend={() => setTab("send")}
          onJumpSubmissions={() => setTab("submissions")}
        />
      )}
      {tab === "send" && (
        <SendTab
          templates={templates}
          people={people}
          onRefreshPeople={refreshPeople}
          disabled={!configured}
          onNotice={setNotice}
          onSent={() => {
            setTab("submissions");
            void reload();
          }}
        />
      )}
      {tab === "templates" && (
        <TemplatesTab
          templates={templates}
          disabled={!configured}
          onChanged={() => void reload()}
          onNotice={setNotice}
        />
      )}
      {tab === "submissions" && (
        <SubmissionsTab
          submissions={submissions}
          docusealUrl={docusealUrl}
          disabled={!configured}
          onChanged={() => void reload()}
          onNotice={setNotice}
        />
      )}
      {tab === "people" && (
        <PeopleTab people={people} loaded={peopleLoaded} onRefresh={refreshPeople} />
      )}
      {tab === "settings" && isAdmin && <SettingsTab onNotice={setNotice} />}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  accent,
  footer,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  accent: string;
  footer?: ReactNode;
}) {
  return (
    <Card padding="md" className="hover:border-slate-600 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accent}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-semibold text-slate-100 leading-tight mt-0.5">{value}</div>
        </div>
      </div>
      {footer ? <div className="mt-3 text-xs text-slate-400">{footer}</div> : null}
    </Card>
  );
}

function OverviewTab({
  stats,
  submissions,
  templates,
  docusealUrl,
  onJumpSend,
  onJumpSubmissions,
}: {
  stats: SubmissionStats;
  submissions: DocusealSubmissionSummary[];
  templates: DocusealTemplateSummary[];
  docusealUrl: string | null;
  onJumpSend: () => void;
  onJumpSubmissions: () => void;
}) {
  const recent = submissions.slice(0, 5);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Wysłane łącznie"
          value={stats.total}
          icon={<FileSignature className="w-5 h-5 text-brand-300" />}
          accent="bg-brand-500/15"
          footer={`Szablony: ${templates.length}`}
        />
        <KpiCard
          label="W toku"
          value={stats.pending}
          icon={<Clock className="w-5 h-5 text-amber-300" />}
          accent="bg-amber-500/15"
          footer="Czekają na podpis"
        />
        <KpiCard
          label="Podpisane"
          value={stats.completed}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-300" />}
          accent="bg-emerald-500/15"
          footer={`Konwersja ${Math.round(stats.completionRate * 100)}%`}
        />
        <KpiCard
          label="Ostatnie 7 dni"
          value={stats.last7d}
          icon={<Send className="w-5 h-5 text-sky-300" />}
          accent="bg-sky-500/15"
          footer={`Odrzucone: ${stats.declined} · Wygasłe: ${stats.expired}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card padding="md" className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-100">Ostatnie wysyłki</h2>
            <Button size="sm" variant="ghost" onClick={onJumpSubmissions}>
              Wszystkie →
            </Button>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">Brak wysyłek.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {recent.map((s) => (
                <li key={s.id} className="py-3 flex items-center gap-3">
                  <StatusDot status={s.status} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-100 truncate">{s.name}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {s.submitters.map((x) => x.email).join(", ")}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {formatRelative(s.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="md">
          <h2 className="text-sm font-semibold text-slate-100 mb-3">Szybkie akcje</h2>
          <div className="space-y-2">
            <Button
              className="w-full"
              leftIcon={<Send className="w-4 h-4" />}
              onClick={onJumpSend}
            >
              Wyślij dokument
            </Button>
            {docusealUrl ? (
              <a href={docusealUrl} target="_blank" rel="noreferrer" className="block">
                <Button variant="secondary" className="w-full" rightIcon={<ArrowUpRight className="w-4 h-4" />}>
                  Otwórz Docuseal
                </Button>
              </a>
            ) : null}
            <div className="text-xs text-slate-500 pt-2 border-t border-slate-800 mt-3">
              <div>Adres webhooku Docuseal:</div>
              <code className="text-slate-300 text-[11px] break-all">
                {typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/docuseal` : "/api/webhooks/docuseal"}
              </code>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SendTab({
  templates,
  people,
  onRefreshPeople,
  disabled,
  onNotice,
  onSent,
}: {
  templates: DocusealTemplateSummary[];
  people: EmployeeRow[];
  onRefreshPeople: () => Promise<void>;
  disabled: boolean;
  onNotice: (n: { tone: "success" | "error" | "info"; msg: string }) => void;
  onSent: () => void;
}) {
  const [mode, setMode] = useState<"existing" | "upload">("existing");
  const [file, setFile] = useState<File | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);

  const [templateId, setTemplateId] = useState<number | "">("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [order, setOrder] = useState<"preserved" | "random">("random");
  const [search, setSearch] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  useEffect(() => {
    if (people.length === 0) void onRefreshPeople();
  }, [people.length, onRefreshPeople]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.email, p.firstName, p.lastName, p.username]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [search, people]);

  const togglePicked = (email: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploadBusy(true);
    try {
      const b64 = await fileToBase64(file);
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: templateName || file.name, pdfBase64: b64 }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const data = await res.json();
      window.open(data.editUrl, "_blank");
      onNotice({ tone: "success", msg: "Szablon utworzony — oznacz pola w otwartej karcie Docuseal, następnie wróć tutaj." });
      setFile(null);
      setTemplateName("");
    } catch (err) {
      onNotice({ tone: "error", msg: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setUploadBusy(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId) return;
    const manualEmails = manual
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes("@"));
    const recipients = Array.from(new Set([...picked, ...manualEmails]));
    if (recipients.length === 0) {
      onNotice({ tone: "error", msg: "Wybierz przynajmniej jednego odbiorcę" });
      return;
    }
    setSendBusy(true);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          recipients: recipients.map((email) => {
            const person = people.find((p) => p.email === email);
            return {
              email,
              name: person ? [person.firstName, person.lastName].filter(Boolean).join(" ") : undefined,
            };
          }),
          subject: subject.trim() || undefined,
          message: message.trim() || undefined,
          order,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      onNotice({
        tone: "success",
        msg: `Wysłano do ${recipients.length} odbiorcy${recipients.length > 1 ? "ów" : ""}.`,
      });
      setPicked(new Set());
      setManual("");
      setSubject("");
      setMessage("");
      setExpiresAt("");
      onSent();
    } catch (err) {
      onNotice({ tone: "error", msg: err instanceof Error ? err.message : "Send failed" });
    } finally {
      setSendBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <Card padding="md">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center">
              <FileText className="w-5 h-5 text-brand-300" />
            </div>
            <h2 className="text-sm font-semibold text-slate-100">1. Szablon</h2>
          </div>
          <div className="flex gap-2 mb-3 text-xs">
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={`px-3 py-1.5 rounded-lg ${
                mode === "existing" ? "bg-brand-600 text-white" : "bg-slate-800 text-slate-300"
              }`}
            >
              Istniejący
            </button>
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`px-3 py-1.5 rounded-lg ${
                mode === "upload" ? "bg-brand-600 text-white" : "bg-slate-800 text-slate-300"
              }`}
            >
              Wgraj nowy PDF
            </button>
          </div>

          {mode === "existing" ? (
            <Select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : "")}
              required
            >
              <option value="">— wybierz szablon —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.fieldsCount} pól)
                </option>
              ))}
            </Select>
          ) : (
            <form onSubmit={upload} className="space-y-3">
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Nazwa szablonu (opcjonalnie)"
              />
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
                className="w-full text-sm text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-600 file:text-white file:font-medium"
              />
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                loading={uploadBusy}
                disabled={disabled || !file}
                leftIcon={<Upload className="w-4 h-4" />}
              >
                Prześlij i oznacz pola
              </Button>
              <p className="text-xs text-slate-500">
                Otworzymy edytor Docuseal w nowej karcie — oznacz pola do podpisu, zapisz, wróć tutaj i odśwież (Realtime zrobi to automatycznie).
              </p>
            </form>
          )}
        </Card>

        <Card padding="md">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <Mail className="w-5 h-5 text-emerald-300" />
            </div>
            <h2 className="text-sm font-semibold text-slate-100">3. Wiadomość (opcjonalnie)</h2>
          </div>
          <div className="space-y-3">
            <Input
              placeholder="Temat e-maila"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Textarea
              placeholder="Treść wiadomości…"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Kolejność</label>
                <Select value={order} onChange={(e) => setOrder(e.target.value as "preserved" | "random")}>
                  <option value="random">Równolegle</option>
                  <option value="preserved">Sekwencyjnie</option>
                </Select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Termin</label>
                <Input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card padding="md" className="lg:col-span-3">
        <form onSubmit={send} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center">
                <Users className="w-5 h-5 text-sky-300" />
              </div>
              <h2 className="text-sm font-semibold text-slate-100">2. Odbiorcy</h2>
              <Badge tone="accent">{picked.size + manual.split(/[,\s;]+/).filter((e) => e.includes("@")).length}</Badge>
            </div>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              type="button"
              onClick={() => void onRefreshPeople()}
            >
              Odśwież
            </Button>
          </div>

          <Input
            placeholder="Szukaj pracownika…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
          <div className="max-h-[280px] overflow-y-auto rounded-xl border border-slate-700/60 divide-y divide-slate-800">
            {filteredPeople.length === 0 ? (
              <p className="text-sm text-slate-500 p-4 text-center">
                {people.length === 0 ? "Pobieranie listy pracowników…" : "Brak wyników."}
              </p>
            ) : (
              filteredPeople.map((p) => {
                const active = picked.has(p.email);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePicked(p.email)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2 transition-colors ${
                      active ? "bg-brand-500/15" : "hover:bg-slate-800/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      readOnly
                      className="rounded border-slate-600"
                    />
                    <PresenceDot online={p.online} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-100 truncate">
                        {[p.firstName, p.lastName].filter(Boolean).join(" ") || p.username}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{p.email}</div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {p.roles.slice(0, 2).map((r) => (
                        <Badge key={r} tone="neutral">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Dodatkowe adresy (manualnie)
            </label>
            <Textarea
              rows={2}
              placeholder="adres@firma.pl, inny@firma.pl"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <Button
            type="submit"
            variant="success"
            className="w-full"
            disabled={disabled || !templateId}
            loading={sendBusy}
            leftIcon={<Send className="w-4 h-4" />}
          >
            Wyślij do podpisu
          </Button>
        </form>
      </Card>
    </div>
  );
}

function TemplatesTab({
  templates,
  disabled,
  onChanged,
  onNotice,
}: {
  templates: DocusealTemplateSummary[];
  disabled: boolean;
  onChanged: () => void;
  onNotice: (n: { tone: "success" | "error" | "info"; msg: string }) => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);

  async function clone(id: number, name: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${name} (kopia)` }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      onNotice({ tone: "success", msg: "Szablon sklonowany." });
      onChanged();
    } catch (err) {
      onNotice({ tone: "error", msg: err instanceof Error ? err.message : "Clone failed" });
    } finally {
      setBusy(null);
    }
  }

  async function archive(id: number) {
    if (!window.confirm("Usunąć szablon z Docuseal?")) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      onNotice({ tone: "success", msg: "Szablon usunięty." });
      onChanged();
    } catch (err) {
      onNotice({ tone: "error", msg: err instanceof Error ? err.message : "Archive failed" });
    } finally {
      setBusy(null);
    }
  }

  if (templates.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" aria-hidden />
        <p className="text-sm text-slate-400">
          Brak szablonów. Przejdź do zakładki „Wyślij" aby wgrać pierwszy PDF.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {templates.map((t) => (
        <Card key={t.id} padding="md" className="flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-100 truncate">{t.name}</h3>
              <p className="text-xs text-slate-500 mt-1">
                {t.fieldsCount} pól · {formatRelative(t.createdAt)}
              </p>
            </div>
            {t.archivedAt ? <Badge tone="warning">Archiwum</Badge> : <Badge tone="success">Aktywny</Badge>}
          </div>
          <div className="mt-auto grid grid-cols-3 gap-2">
            <a
              href={t.editUrl}
              target="_blank"
              rel="noreferrer"
              className="text-center text-xs px-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              Edytuj
            </a>
            <button
              type="button"
              onClick={() => void clone(t.id, t.name)}
              disabled={busy === t.id || disabled}
              className="text-xs px-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50"
            >
              Klonuj
            </button>
            <button
              type="button"
              onClick={() => void archive(t.id)}
              disabled={busy === t.id || disabled}
              className="text-xs px-2 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 disabled:opacity-50"
            >
              Usuń
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function SubmissionsTab({
  submissions,
  docusealUrl,
  disabled,
  onChanged,
  onNotice,
}: {
  submissions: DocusealSubmissionSummary[];
  docusealUrl: string | null;
  disabled: boolean;
  onChanged: () => void;
  onNotice: (n: { tone: "success" | "error" | "info"; msg: string }) => void;
}) {
  const [filter, setFilter] = useState<"all" | "pending" | "completed" | "declined" | "expired">("all");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<DocusealSubmissionSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return submissions.filter((s) => {
      if (filter !== "all" && s.status !== filter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.submitters.some((x) => x.email.toLowerCase().includes(q))
      );
    });
  }, [submissions, filter, search]);

  async function archive(id: number) {
    if (!window.confirm("Usunąć/zarchiwizować tę wysyłkę?")) return;
    setBusy(`arch-${id}`);
    try {
      const res = await fetch(`/api/submissions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onNotice({ tone: "success", msg: "Wysyłka zarchiwizowana." });
      onChanged();
    } catch (err) {
      onNotice({ tone: "error", msg: err instanceof Error ? err.message : "Archive failed" });
    } finally {
      setBusy(null);
    }
  }

  async function resend(subId: number) {
    setBusy(`resend-${subId}`);
    try {
      const res = await fetch(`/api/submitters/${subId}/resend`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onNotice({ tone: "success", msg: "Przypomnienie wysłane." });
    } catch (err) {
      onNotice({ tone: "error", msg: err instanceof Error ? err.message : "Resend failed" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card padding="sm" className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Filter className="w-4 h-4" aria-hidden />
          Filtr:
        </div>
        {(["all", "pending", "completed", "declined", "expired"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 text-xs rounded-lg ${
              filter === f
                ? "bg-brand-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
        <div className="flex-1 min-w-[220px]">
          <Input
            placeholder="Szukaj dokumentu, emaila…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
      </Card>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-400 text-left border-b border-slate-800">
                <th className="px-4 py-3 font-medium">Dokument</th>
                <th className="px-4 py-3 font-medium">Odbiorcy</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Utworzono</th>
                <th className="px-4 py-3 font-medium text-right">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                    Brak wysyłek spełniających kryteria.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40 cursor-pointer"
                    onClick={() => setActive(s)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-100 truncate max-w-[220px]">{s.name}</div>
                      {s.templateName ? (
                        <div className="text-[11px] text-slate-500 truncate max-w-[220px]">
                          {s.templateName}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5 max-w-[260px]">
                        {s.submitters.slice(0, 2).map((x) => (
                          <div key={x.id} className="flex items-center gap-1.5 text-xs text-slate-300">
                            <SubmitterDot status={x.status} />
                            <span className="truncate">{x.email}</span>
                          </div>
                        ))}
                        {s.submitters.length > 2 ? (
                          <span className="text-[11px] text-slate-500">
                            +{s.submitters.length - 2} więcej
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {formatRelative(s.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {s.status === "completed" ? (
                          <a
                            href={`/api/documents/${s.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center p-2 rounded-lg text-slate-300 hover:bg-slate-700"
                            title="Pobierz podpisany PDF"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void resend(s.submitters[0]?.id)}
                            disabled={!s.submitters[0] || busy === `resend-${s.submitters[0]?.id}` || disabled}
                            className="inline-flex items-center p-2 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                            title="Wyślij przypomnienie"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                        )}
                        {docusealUrl ? (
                          <a
                            href={`${docusealUrl}/submissions/${s.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center p-2 rounded-lg text-slate-300 hover:bg-slate-700"
                            title="Otwórz w Docuseal"
                          >
                            <ArrowUpRight className="w-4 h-4" />
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void archive(s.id)}
                          disabled={busy === `arch-${s.id}` || disabled}
                          className="inline-flex items-center p-2 rounded-lg text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                          title="Archiwizuj"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <SubmissionDetailDialog
        submission={active}
        onClose={() => setActive(null)}
        onResend={resend}
        docusealUrl={docusealUrl}
      />
    </div>
  );
}

function PeopleTab({
  people,
  loaded,
  onRefresh,
}: {
  people: EmployeeRow[];
  loaded: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "online">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (filter === "online" && !p.online) return false;
      if (!q) return true;
      return [p.email, p.firstName, p.lastName, p.username]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [people, search, filter]);

  return (
    <div className="space-y-4">
      <Card padding="sm" className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(["all", "online"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded-lg ${
                filter === f
                  ? "bg-brand-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {f === "all" ? `Wszyscy (${people.length})` : `Online (${people.filter((p) => p.online).length})`}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[220px]">
          <Input
            placeholder="Szukaj…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          onClick={() => void onRefresh()}
        >
          Odśwież
        </Button>
      </Card>

      {!loaded ? (
        <Card padding="lg" className="text-center text-sm text-slate-500">
          Ładowanie listy pracowników…
        </Card>
      ) : filtered.length === 0 ? (
        <Card padding="lg" className="text-center text-sm text-slate-500">
          Brak pracowników spełniających kryteria.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <Card key={p.id} padding="md" className="flex items-start gap-3">
              <div className="relative w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                <span className="text-sm font-semibold text-slate-200">
                  {(p.firstName?.[0] ?? p.email[0] ?? "?").toUpperCase()}
                  {(p.lastName?.[0] ?? "").toUpperCase()}
                </span>
                <span
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${
                    p.online ? "bg-emerald-400" : "bg-slate-500"
                  }`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-100 truncate">
                  {[p.firstName, p.lastName].filter(Boolean).join(" ") || p.username}
                </div>
                <div className="text-xs text-slate-500 truncate">{p.email}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.online ? (
                    <Badge tone="success">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Online
                    </Badge>
                  ) : p.lastActiveAt ? (
                    <Badge tone="neutral">
                      Ostatnio: {formatRelative(new Date(p.lastActiveAt).toISOString())}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Offline</Badge>
                  )}
                  {p.roles.slice(0, 3).map((r) => (
                    <Badge key={r} tone="info">
                      {r}
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsTab({
  onNotice,
}: {
  onNotice: (n: { tone: "success" | "error" | "info"; msg: string }) => void;
}) {
  const [hooks, setHooks] = useState<Array<{ id?: number; url: string; events: string[] }>>([]);
  const [secretConfigured, setSecretConfigured] = useState(false);
  const [draftUrl, setDraftUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/webhooks");
      const data = await res.json();
      setHooks(data.webhooks ?? []);
      setSecretConfigured(!!data.secretConfigured);
      if (typeof window !== "undefined") {
        setDraftUrl(`${window.location.origin}/api/webhooks/docuseal`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: draftUrl,
          events: [
            "submission.created",
            "submission.completed",
            "submission.declined",
            "submission.expired",
            "form.completed",
            "form.declined",
            "form.viewed",
            "form.started",
          ],
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      onNotice({ tone: "success", msg: "Webhook zapisany w Docuseal." });
      void load();
    } catch (err) {
      onNotice({ tone: "error", msg: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/webhooks?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onNotice({ tone: "success", msg: "Webhook usunięty." });
      void load();
    } catch (err) {
      onNotice({ tone: "error", msg: err instanceof Error ? err.message : "Delete failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <Card padding="md">
        <h2 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2">
          <Settings className="w-4 h-4" /> Webhooki Docuseal
        </h2>
        <div className="text-xs text-slate-400 mb-4 space-y-1">
          <p>Dzięki webhookom panel odbiera zdarzenia (podpisane, odrzucone, wygasłe) w czasie rzeczywistym.</p>
          <p>
            HMAC signing key:{" "}
            {secretConfigured ? (
              <Badge tone="success">Skonfigurowany (DOCUSEAL_WEBHOOK_SECRET)</Badge>
            ) : (
              <Badge tone="warning">Brak — webhook bez weryfikacji</Badge>
            )}
          </p>
        </div>

        <div className="flex gap-2 mb-4">
          <Input
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            placeholder="https://dokumenty.myperformance.pl/api/webhooks/docuseal"
            leftIcon={<Copy className="w-4 h-4" />}
          />
          <Button onClick={() => void save()} loading={busy}>
            Zapisz w Docuseal
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Ładowanie…</p>
        ) : hooks.length === 0 ? (
          <p className="text-sm text-slate-500">Brak zarejestrowanych webhooków.</p>
        ) : (
          <ul className="space-y-2">
            {hooks.map((h) => (
              <li
                key={h.id ?? h.url}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900/50"
              >
                <div className="min-w-0">
                  <div className="text-sm text-slate-200 truncate">{h.url}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {h.events.join(" · ") || "wszystkie zdarzenia"}
                  </div>
                </div>
                {h.id ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void remove(h.id!)}
                    disabled={busy}
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    Usuń
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SubmissionDetailDialog({
  submission,
  onClose,
  onResend,
  docusealUrl,
}: {
  submission: DocusealSubmissionSummary | null;
  onClose: () => void;
  onResend: (subId: number) => Promise<void>;
  docusealUrl: string | null;
}) {
  if (!submission) return null;
  return (
    <Dialog
      open={!!submission}
      onClose={onClose}
      size="lg"
      title={submission.name}
      description={
        <span className="inline-flex gap-2 items-center">
          <StatusBadge status={submission.status} />
          <span>Utworzono {new Date(submission.createdAt).toLocaleString("pl-PL")}</span>
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zamknij
          </Button>
          {submission.status === "completed" ? (
            <a
              href={`/api/documents/${submission.id}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="primary" leftIcon={<Download className="w-4 h-4" />}>
                Pobierz PDF
              </Button>
            </a>
          ) : null}
          {docusealUrl ? (
            <a href={`${docusealUrl}/submissions/${submission.id}`} target="_blank" rel="noreferrer">
              <Button variant="secondary" rightIcon={<ArrowUpRight className="w-4 h-4" />}>
                Docuseal
              </Button>
            </a>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        <h3 className="text-xs uppercase text-slate-400 tracking-wider">Podpisujący</h3>
        <ul className="space-y-2">
          {submission.submitters.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900/50"
            >
              <div className="min-w-0">
                <div className="text-sm text-slate-100 truncate">
                  {s.name || s.email}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {s.email}
                  {s.completedAt ? ` · podpisano ${new Date(s.completedAt).toLocaleString("pl-PL")}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={s.status} />
                {s.status !== "completed" ? (
                  <Button size="sm" variant="secondary" onClick={() => void onResend(s.id)}>
                    Przypomnij
                  </Button>
                ) : null}
                {s.signUrl ? (
                  <a href={s.signUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost" rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}>
                      Link
                    </Button>
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {submission.auditLogUrl ? (
          <a
            href={submission.auditLogUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-brand-400 hover:text-brand-300 inline-flex items-center gap-1"
          >
            Audit log <ArrowUpRight className="w-3 h-3" />
          </a>
        ) : null}
      </div>
    </Dialog>
  );
}

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const STATUS_PALETTE: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "W toku", tone: "warning" },
  awaiting: { label: "Oczekuje", tone: "warning" },
  sent: { label: "Wysłane", tone: "info" },
  opened: { label: "Otwarte", tone: "info" },
  completed: { label: "Podpisane", tone: "success" },
  declined: { label: "Odrzucone", tone: "danger" },
  expired: { label: "Wygasłe", tone: "neutral" },
};

const FILTER_LABEL: Record<string, string> = {
  all: "Wszystkie",
  pending: "W toku",
  completed: "Podpisane",
  declined: "Odrzucone",
  expired: "Wygasłe",
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_PALETTE[status] ?? { label: status, tone: "neutral" as const };
  const icon =
    status === "completed" ? (
      <CheckCircle2 className="w-3 h-3" />
    ) : status === "declined" ? (
      <XCircle className="w-3 h-3" />
    ) : status === "expired" ? (
      <Clock className="w-3 h-3" />
    ) : (
      <Clock className="w-3 h-3" />
    );
  return (
    <Badge tone={s.tone}>
      {icon}
      {s.label}
    </Badge>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "bg-emerald-400"
      : status === "declined"
        ? "bg-red-400"
        : status === "expired"
          ? "bg-slate-500"
          : "bg-amber-400";
  return <span className={`w-2 h-2 rounded-full ${color} flex-shrink-0`} />;
}

function SubmitterDot({ status }: { status: string }) {
  return <StatusDot status={status === "completed" ? "completed" : "pending"} />;
}

function PresenceDot({ online }: { online: boolean }) {
  return (
    <span
      className={`w-2 h-2 rounded-full flex-shrink-0 ${
        online ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
      }`}
    />
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      resolve(s.split(",")[1] ?? s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "przed chwilą";
  if (m < 60) return `${m} min temu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} godz. temu`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} dni temu`;
  return new Date(iso).toLocaleDateString("pl-PL");
}
