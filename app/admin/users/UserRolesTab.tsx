"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Check,
  ChevronRight,
  Layers,
  Pencil,
  Plus,
  Trash2,
  UsersIcon,
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
import { ROLE_CATALOG } from "@/lib/admin-auth";

interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  realmRoles: string[];
  memberCount: number;
}

interface GroupDraft {
  name: string;
  description: string;
  realmRoles: Set<string>;
}

const INITIAL_DRAFT: GroupDraft = {
  name: "",
  description: "",
  realmRoles: new Set(),
};

export function UserRolesTab() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);

  const [editing, setEditing] = useState<GroupSummary | "new" | null>(null);
  const [draft, setDraft] = useState<GroupDraft>(INITIAL_DRAFT);
  const [pending, setPending] = useState(false);

  const catalog = useMemo(
    () =>
      ROLE_CATALOG.map((r) => ({
        name: r.name,
        description: r.description,
        default: r.default,
      })),
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.get<{ groups: GroupSummary[] }>(
        "/api/admin/groups",
      );
      setGroups(data.groups ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Nie udało się pobrać ról");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setDraft(INITIAL_DRAFT);
    setEditing("new");
  };

  const openEdit = (group: GroupSummary) => {
    setDraft({
      name: group.name,
      description: group.description ?? "",
      realmRoles: new Set(group.realmRoles),
    });
    setEditing(group);
  };

  const close = () => {
    setEditing(null);
    setDraft(INITIAL_DRAFT);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setPending(true);
    setFeedback(null);
    try {
      const roles = Array.from(draft.realmRoles);
      if (editing === "new") {
        await api.post("/api/admin/groups", {
          name: draft.name.trim(),
          description: draft.description.trim(),
          realmRoles: roles,
        });
      } else if (editing) {
        await api.put(`/api/admin/groups/${editing.id}`, {
          name: draft.name.trim(),
          description: draft.description.trim(),
        });
        await api.post(`/api/admin/groups/${editing.id}/roles`, {
          realmRoles: roles,
        });
      }
      await load();
      close();
      setFeedback({
        tone: "success",
        message:
          editing === "new"
            ? `Utworzono rolę „${draft.name.trim()}".`
            : `Zaktualizowano rolę „${draft.name.trim()}".`,
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
  };

  const removeGroup = useCallback(
    async (group: GroupSummary) => {
      if (
        !window.confirm(
          `Usunąć rolę „${group.name}"? Członkowie stracą uprawnienia z tej roli.`,
        )
      ) {
        return;
      }
      setFeedback(null);
      try {
        await api.delete(`/api/admin/groups/${group.id}`);
        await load();
        setFeedback({
          tone: "success",
          message: `Usunięto rolę „${group.name}".`,
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

  return (
    <Card padding="lg" className="space-y-4">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
            <Layers className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-main)]">
              Role użytkowników
            </h2>
            <p className="text-xs text-[var(--text-muted)] max-w-lg">
              Szablony uprawnień odzwierciedlające stanowiska w organizacji
              (np. „Pracownik", „Kierownik księgowy", „Nauczyciel Akademii").
              Każda rola to grupa Keycloak z przypisanymi rolami realmu —
              przypisanie użytkownika do roli nada mu wszystkie jej uprawnienia.
            </p>
          </div>
        </div>
        <Button
          leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}
          onClick={openCreate}
        >
          Nowa rola
        </Button>
      </header>

      {loadError && <Alert tone="error">{loadError}</Alert>}
      {feedback && <Alert tone={feedback.tone}>{feedback.message}</Alert>}

      {loading && groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">
          Ładowanie ról…
        </p>
      ) : groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">
          Nie zdefiniowano jeszcze żadnej roli. Utwórz pierwszy szablon, żeby
          szybko nadawać uprawnienia nowym użytkownikom.
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const open = expanded[g.id] === true;
            return (
              <div
                key={g.id}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/60"
              >
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [g.id]: !prev[g.id] }))
                    }
                  >
                    <ChevronRight
                      className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${open ? "rotate-90" : ""}`}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-main)]">
                        {g.name}
                      </p>
                      {g.description && (
                        <p className="text-[11px] text-[var(--text-muted)] truncate">
                          {g.description}
                        </p>
                      )}
                    </div>
                  </button>
                  <Badge tone="neutral">
                    {g.realmRoles.length}{" "}
                    {g.realmRoles.length === 1 ? "uprawnienie" : "uprawnień"}
                  </Badge>
                  <Badge tone={g.memberCount > 0 ? "accent" : "neutral"}>
                    <UsersIcon className="w-3 h-3 mr-1" aria-hidden="true" />
                    {g.memberCount}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Edytuj"
                    onClick={() => openEdit(g)}
                  >
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Usuń"
                    onClick={() => void removeGroup(g)}
                    className="text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </div>
                {open && (
                  <div className="px-4 pb-3 pt-1">
                    {g.realmRoles.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)]">
                        Nie przypisano uprawnień do tej roli — edytuj, aby
                        dodać uprawnienia z katalogu.
                      </p>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {g.realmRoles.map((rn) => (
                          <li key={rn}>
                            <code className="inline-block text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--bg-main)]/60 text-[var(--accent)] border border-[var(--border-subtle)]">
                              {rn}
                            </code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={editing !== null}
        onClose={close}
        title={editing === "new" ? "Nowa rola użytkowników" : "Edytuj rolę"}
        size="lg"
      >
        <form onSubmit={submit} className="space-y-4">
          <FieldWrapper id="gname" label="Nazwa">
            <Input
              id="gname"
              value={draft.name}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="np. Kierownik księgowości"
              disabled={pending}
              required
            />
          </FieldWrapper>
          <FieldWrapper id="gdesc" label="Opis">
            <Textarea
              id="gdesc"
              rows={2}
              value={draft.description}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Co robi ta osoba w organizacji? Jakie aplikacje jej potrzeba?"
              disabled={pending}
            />
          </FieldWrapper>
          <div>
            <p className="text-sm font-medium text-[var(--text-muted)] mb-2">
              Uprawnienia w aplikacjach ({draft.realmRoles.size} wybranych)
            </p>
            <div className="max-h-72 overflow-y-auto border border-[var(--border-subtle)] rounded-lg divide-y divide-[var(--border-subtle)]">
              {catalog.map((r) => {
                const checked = draft.realmRoles.has(r.name);
                return (
                  <label
                    key={r.name}
                    className="flex items-start gap-3 px-3 py-2 hover:bg-[var(--bg-main)]/40 cursor-pointer"
                  >
                    <Checkbox
                      checked={checked}
                      onChange={(e) =>
                        setDraft((prev) => {
                          const next = new Set(prev.realmRoles);
                          if (e.target.checked) next.add(r.name);
                          else next.delete(r.name);
                          return { ...prev, realmRoles: next };
                        })
                      }
                      disabled={r.default || pending}
                    />
                    <div className="min-w-0 flex-1">
                      <code className="text-[11px] font-mono text-[var(--accent)]">
                        {r.name}
                      </code>
                      {r.default && (
                        <Badge tone="info" className="ml-2">domyślna</Badge>
                      )}
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                        {r.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={close} disabled={pending}>
              Anuluj
            </Button>
            <Button
              type="submit"
              loading={pending}
              leftIcon={!pending && <Check className="w-4 h-4" aria-hidden="true" />}
            >
              {editing === "new" ? "Utwórz" : "Zapisz"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
