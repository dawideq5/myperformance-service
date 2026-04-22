"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ExternalLink,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  FieldWrapper,
  Input,
  Textarea,
} from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";

interface CwPermission {
  key: string;
  label: string;
  group: string;
}

interface CwRole {
  id: number;
  name: string;
  description: string | null;
  permissions: string[];
}

interface CwState {
  configured: boolean;
  roles: CwRole[];
  permissions: CwPermission[];
}

interface CwDraft {
  id: number | null;
  name: string;
  description: string;
  permissions: Set<string>;
}

const CW_DRAFT_EMPTY: CwDraft = {
  id: null,
  name: "",
  description: "",
  permissions: new Set(),
};

const NATIVE_APP_SPECS: Array<{
  id: string;
  name: string;
  description: string;
  adminUrl?: string;
  status:
    | "native"
    | "limited"
    | "external-ui"
    | "planned";
  note?: string;
}> = [
  {
    id: "chatwoot",
    name: "Chatwoot",
    description:
      "Własne role (custom_roles) z granularnymi uprawnieniami rozmów, kontaktów i raportów. Pełna integracja przez Platform API.",
    adminUrl: "https://chat.myperformance.pl/app/accounts/1/settings/custom-roles/list",
    status: "native",
  },
  {
    id: "directus",
    name: "Directus CMS",
    description:
      "Role z macierzą uprawnień (CRUD per kolekcja). Interfejs natywny w Directus jest bardziej rozbudowany niż cokolwiek, co opłaca się duplikować.",
    adminUrl: "https://cms.myperformance.pl/admin/settings/roles",
    status: "external-ui",
  },
  {
    id: "moodle",
    name: "MyPerformance — Akademia (Moodle)",
    description:
      "Role systemowe (siteadmin auto-sync z KC), role kursowe przypisywane w Moodle. Mapowanie KC→Moodle siteadmin: local_mpkc_sync.",
    adminUrl: "https://moodle.myperformance.pl/admin/roles/manage.php",
    status: "external-ui",
  },
  {
    id: "documenso",
    name: "Dokumenty (Documenso)",
    description:
      "Dwa natywne poziomy (USER / ADMIN) synchronizowane automatycznie po SSO z uprawnień KC. Rozszerzone role wykraczają poza model Documenso 1.x.",
    status: "limited",
  },
  {
    id: "postal",
    name: "Postal",
    description:
      "Postal rozróżnia tylko admina od zwykłego użytkownika. Granularność pozostawiamy w rękach KC realm roles (postal_admin).",
    adminUrl: "https://postal.myperformance.pl/",
    status: "limited",
  },
  {
    id: "outline",
    name: "Baza wiedzy (Outline)",
    description:
      "Model workspace: admin/member/viewer. Awans do workspace admin jest operacją wewnątrz Outline.",
    adminUrl: "https://knowledge.myperformance.pl/settings/members",
    status: "external-ui",
  },
  {
    id: "stepca",
    name: "step-ca",
    description:
      "PKI bez wieloużytkownikowych ról — operacje wykonuje każda osoba z rolą certificates_admin przez panel dashboardu lub step CLI.",
    status: "limited",
  },
];

function statusBadge(status: (typeof NATIVE_APP_SPECS)[number]["status"]) {
  switch (status) {
    case "native":
      return <Badge tone="success">Pełna integracja</Badge>;
    case "limited":
      return <Badge tone="warning">Model dwupoziomowy</Badge>;
    case "external-ui":
      return <Badge tone="info">Natywny panel aplikacji</Badge>;
    case "planned":
      return <Badge tone="neutral">Planowane</Badge>;
  }
}

export function AppPermissionsTab() {
  return (
    <Card padding="lg" className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            Uprawnienia w aplikacjach zewnętrznych
          </h2>
          <p className="text-xs text-[var(--text-muted)] max-w-2xl">
            Każda aplikacja ma własny model uprawnień. Tam, gdzie aplikacja
            oferuje bogate API (Chatwoot custom_roles), zarządzamy rolami
            bezpośrednio stąd. Tam, gdzie interfejs natywny jest lepszy
            (Directus macierz CRUD, Moodle 400+ capability), linkujemy do
            panelu aplikacji — ograniczenia aplikacji są też ograniczeniami
            naszej integracji.
          </p>
        </div>
      </header>

      <ChatwootSection />

      <div className="space-y-2">
        {NATIVE_APP_SPECS.filter((a) => a.id !== "chatwoot").map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </div>
    </Card>
  );
}

function AppCard({
  app,
}: {
  app: (typeof NATIVE_APP_SPECS)[number];
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/60 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-sm font-semibold text-[var(--text-main)]">
              {app.name}
            </h3>
            {statusBadge(app.status)}
          </div>
          <p className="text-xs text-[var(--text-muted)]">{app.description}</p>
        </div>
        {app.adminUrl && (
          <a href={app.adminUrl} target="_blank" rel="noopener noreferrer">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              Panel aplikacji
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}

function ChatwootSection() {
  const [state, setState] = useState<CwState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<CwDraft | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.get<CwState>("/api/admin/apps/chatwoot/roles");
      setState(data);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Nie udało się pobrać ról Chatwoot",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startCreate = useCallback(() => {
    setEditing({ ...CW_DRAFT_EMPTY, permissions: new Set() });
  }, []);

  const startEdit = useCallback((role: CwRole) => {
    setEditing({
      id: role.id,
      name: role.name,
      description: role.description ?? "",
      permissions: new Set(role.permissions ?? []),
    });
  }, []);

  const close = useCallback(() => setEditing(null), []);

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!editing || !editing.name.trim()) return;
      setPending(true);
      setFeedback(null);
      try {
        const permissions = Array.from(editing.permissions);
        if (editing.id == null) {
          await api.post("/api/admin/apps/chatwoot/roles", {
            name: editing.name.trim(),
            description: editing.description.trim(),
            permissions,
          });
        } else {
          await api.patch(`/api/admin/apps/chatwoot/roles/${editing.id}`, {
            name: editing.name.trim(),
            description: editing.description.trim(),
            permissions,
          });
        }
        await load();
        close();
        setFeedback({
          tone: "success",
          message:
            editing.id == null
              ? `Utworzono rolę Chatwoot „${editing.name.trim()}".`
              : `Zaktualizowano rolę Chatwoot „${editing.name.trim()}".`,
        });
      } catch (err) {
        setFeedback({
          tone: "error",
          message:
            err instanceof ApiRequestError
              ? err.message
              : "Nie udało się zapisać roli",
        });
      } finally {
        setPending(false);
      }
    },
    [editing, load, close],
  );

  const remove = useCallback(
    async (role: CwRole) => {
      if (!window.confirm(`Usunąć rolę Chatwoot „${role.name}"?`)) return;
      setFeedback(null);
      try {
        await api.delete(`/api/admin/apps/chatwoot/roles/${role.id}`);
        await load();
        setFeedback({
          tone: "success",
          message: `Usunięto rolę Chatwoot „${role.name}".`,
        });
      } catch (err) {
        setFeedback({
          tone: "error",
          message:
            err instanceof ApiRequestError
              ? err.message
              : "Nie udało się usunąć roli",
        });
      }
    },
    [load],
  );

  const groupedPerms = useMemo(() => {
    const perms = state?.permissions ?? [];
    const byGroup = new Map<string, CwPermission[]>();
    for (const p of perms) {
      const list = byGroup.get(p.group) ?? [];
      list.push(p);
      byGroup.set(p.group, list);
    }
    return byGroup;
  }, [state?.permissions]);

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/60">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronRight
          className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${expanded ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-[var(--text-main)]">
              Chatwoot — role niestandardowe (custom_roles)
            </h3>
            {statusBadge("native")}
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Granularne uprawnienia rozmów, kontaktów, raportów. Rola jest
            przypisywana agentom w Chatwoot przez admina konta.
          </p>
        </div>
        <Badge tone="neutral">{state?.roles.length ?? "?"} ról</Badge>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {loadError && <Alert tone="error">{loadError}</Alert>}
          {feedback && <Alert tone={feedback.tone}>{feedback.message}</Alert>}

          {state && !state.configured ? (
            <Alert tone="warning">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Chatwoot Platform API nie jest skonfigurowane
                  (CHATWOOT_PLATFORM_TOKEN). Zarządzanie rolami niedostępne.
                </span>
              </div>
            </Alert>
          ) : (
            <>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                  onClick={startCreate}
                  disabled={loading}
                >
                  Nowa rola Chatwoot
                </Button>
              </div>

              {loading && !state ? (
                <p className="py-4 text-center text-xs text-[var(--text-muted)]">
                  Ładowanie…
                </p>
              ) : state && state.roles.length === 0 ? (
                <p className="py-4 text-center text-xs text-[var(--text-muted)]">
                  Brak własnych ról. Utwórz pierwszą, żeby przypisywać je
                  agentom Chatwoot w panelu aplikacji.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {(state?.roles ?? []).map((role) => (
                    <li
                      key={role.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border-subtle)]/60 bg-[var(--bg-main)]/40"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-main)]">
                          {role.name}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] truncate">
                          {role.description || "—"}
                        </p>
                      </div>
                      <Badge tone="neutral">
                        {role.permissions.length} uprawnień
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEdit(role)}
                      >
                        Edytuj
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Usuń"
                        onClick={() => void remove(role)}
                        className="text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <CwRoleDialog
        draft={editing}
        groupedPerms={groupedPerms}
        pending={pending}
        onChange={setEditing}
        onClose={close}
        onSubmit={submit}
      />
    </div>
  );
}

function CwRoleDialog({
  draft,
  groupedPerms,
  pending,
  onChange,
  onClose,
  onSubmit,
}: {
  draft: CwDraft | null;
  groupedPerms: Map<string, CwPermission[]>;
  pending: boolean;
  onChange: (next: CwDraft | null) => void;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <Dialog
      open={draft !== null}
      onClose={onClose}
      title={
        draft?.id == null ? "Nowa rola Chatwoot" : `Edycja „${draft?.name}"`
      }
      size="lg"
    >
      {draft && (
        <form onSubmit={onSubmit} className="space-y-4">
          <FieldWrapper id="cwname" label="Nazwa">
            <Input
              id="cwname"
              value={draft.name}
              onChange={(e) =>
                onChange({ ...draft, name: e.target.value })
              }
              placeholder="np. Supervisor"
              required
              disabled={pending}
            />
          </FieldWrapper>
          <FieldWrapper id="cwdesc" label="Opis">
            <Textarea
              id="cwdesc"
              rows={2}
              value={draft.description}
              onChange={(e) =>
                onChange({ ...draft, description: e.target.value })
              }
              disabled={pending}
            />
          </FieldWrapper>
          <div>
            <p className="text-sm font-medium text-[var(--text-muted)] mb-2">
              Uprawnienia ({draft.permissions.size})
            </p>
            <div className="space-y-3 max-h-72 overflow-y-auto border border-[var(--border-subtle)] rounded-lg p-3">
              {Array.from(groupedPerms.entries()).map(([group, perms]) => (
                <div key={group}>
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    {group}
                  </p>
                  <ul className="space-y-1">
                    {perms.map((p) => (
                      <li key={p.key}>
                        <label className="flex items-start gap-2 px-2 py-1 rounded hover:bg-[var(--bg-main)]/40">
                          <Checkbox
                            checked={draft.permissions.has(p.key)}
                            onChange={(e) => {
                              const next = new Set(draft.permissions);
                              if (e.target.checked) next.add(p.key);
                              else next.delete(p.key);
                              onChange({ ...draft, permissions: next });
                            }}
                            disabled={pending}
                          />
                          <span className="text-xs">
                            <span className="block text-[var(--text-main)]">
                              {p.label}
                            </span>
                            <code className="text-[10px] font-mono text-[var(--text-muted)]">
                              {p.key}
                            </code>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Anuluj
            </Button>
            <Button
              type="submit"
              loading={pending}
              leftIcon={!pending && <Check className="w-4 h-4" aria-hidden="true" />}
            >
              {draft.id == null ? "Utwórz" : "Zapisz"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
