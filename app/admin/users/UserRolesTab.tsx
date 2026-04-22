"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Check,
  ChevronRight,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users as UsersIcon,
  X,
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

interface GroupMember {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  realmRoles: string[];
  memberCount: number;
  members: GroupMember[];
}

interface GroupDraft {
  name: string;
  description: string;
  realmRoles: Set<string>;
}

interface SearchHit {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

const INITIAL_DRAFT: GroupDraft = {
  name: "",
  description: "",
  realmRoles: new Set(),
};

function displayName(u: {
  firstName: string | null;
  lastName: string | null;
  username: string;
  email?: string | null;
}) {
  const fn = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return fn || u.email || u.username;
}

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

  const [assignTo, setAssignTo] = useState<GroupSummary | null>(null);
  const [pendingUser, setPendingUser] = useState<string | null>(null);

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

  const openCreate = useCallback(() => {
    setDraft(INITIAL_DRAFT);
    setEditing("new");
  }, []);

  const openEdit = useCallback((group: GroupSummary) => {
    setDraft({
      name: group.name,
      description: group.description ?? "",
      realmRoles: new Set(group.realmRoles),
    });
    setEditing(group);
  }, []);

  const closeEditor = useCallback(() => {
    setEditing(null);
    setDraft(INITIAL_DRAFT);
  }, []);

  const submit = useCallback(
    async (e: FormEvent) => {
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
        closeEditor();
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
    },
    [draft, editing, load, closeEditor],
  );

  const removeGroup = useCallback(
    async (group: GroupSummary) => {
      if (
        !window.confirm(
          `Usunąć rolę „${group.name}"? Członkowie stracą uprawnienia z tej roli (ich bezpośrednio przypisane role zostaną).`,
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

  const assignUserToGroup = useCallback(
    async (userId: string, group: GroupSummary) => {
      setPendingUser(userId);
      setFeedback(null);
      try {
        await api.post(`/api/admin/users/${userId}/groups`, {
          join: [group.id],
        });
        await load();
        setAssignTo(null);
        setFeedback({
          tone: "success",
          message: `Dodano użytkownika do roli „${group.name}". Jego dotychczasowe uprawnienia pozostają — nowe są doliczone.`,
        });
      } catch (err) {
        setFeedback({
          tone: "error",
          message:
            err instanceof ApiRequestError
              ? err.message
              : "Nie udało się przypisać użytkownika",
        });
      } finally {
        setPendingUser(null);
      }
    },
    [load],
  );

  const removeUserFromGroup = useCallback(
    async (user: GroupMember, group: GroupSummary) => {
      if (
        !window.confirm(
          `Usunąć ${displayName(user)} z roli „${group.name}"?\n\nBezpośrednio przypisane uprawnienia użytkownika zostaną — traci tylko te z tej roli.`,
        )
      ) {
        return;
      }
      setPendingUser(user.id);
      setFeedback(null);
      try {
        await api.post(`/api/admin/users/${user.id}/groups`, {
          leave: [group.id],
        });
        await load();
        setFeedback({
          tone: "success",
          message: `Usunięto ${displayName(user)} z roli „${group.name}".`,
        });
      } catch (err) {
        setFeedback({
          tone: "error",
          message:
            err instanceof ApiRequestError
              ? err.message
              : "Nie udało się usunąć użytkownika z roli",
        });
      } finally {
        setPendingUser(null);
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
            <p className="text-xs text-[var(--text-muted)] max-w-2xl">
              Szablony uprawnień odzwierciedlające stanowiska w organizacji
              (np. „Pracownik", „Kierownik księgowy", „Nauczyciel Akademii").
              Każda rola to grupa Keycloak z przypisanymi uprawnieniami — przypisanie
              użytkownika <strong>doda</strong> mu te uprawnienia, nie nadpisze
              istniejących. Przypisanie jest kumulatywne i odwracalne.
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
                    size="sm"
                    variant="ghost"
                    leftIcon={<UserPlus className="w-3.5 h-3.5" aria-hidden="true" />}
                    onClick={() => {
                      setAssignTo(g);
                      setFeedback(null);
                    }}
                  >
                    Przypisz
                  </Button>
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
                  <div className="px-4 pb-3 pt-1 space-y-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                        Uprawnienia
                      </p>
                      {g.realmRoles.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)]">
                          Nie przypisano uprawnień — edytuj, aby wybrać z katalogu.
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
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                        Członkowie ({g.members.length})
                      </p>
                      {g.members.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)]">
                          Nikt nie ma jeszcze tej roli. Kliknij „Przypisz".
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {g.members.map((u) => (
                            <li
                              key={u.id}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--bg-main)]/70"
                            >
                              <span className="flex-1 min-w-0">
                                <span className="text-sm text-[var(--text-main)]">
                                  {displayName(u)}
                                </span>
                                {u.email && (
                                  <span className="ml-2 text-[11px] text-[var(--text-muted)] truncate">
                                    {u.email}
                                  </span>
                                )}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Usuń z roli"
                                loading={pendingUser === u.id}
                                onClick={() => removeUserFromGroup(u, g)}
                                className="text-red-500 hover:bg-red-500/10"
                              >
                                <X className="w-3.5 h-3.5" aria-hidden="true" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <EditGroupDialog
        open={editing !== null}
        isNew={editing === "new"}
        draft={draft}
        setDraft={setDraft}
        catalog={catalog}
        pending={pending}
        onSubmit={submit}
        onClose={closeEditor}
      />

      <AssignUserDialog
        group={assignTo}
        onClose={() => setAssignTo(null)}
        onAssign={assignUserToGroup}
        pendingUser={pendingUser}
      />
    </Card>
  );
}

/**
 * Extracted so parent re-renders (each keystroke) do not re-create the
 * dialog subtree. Input focus is preserved.
 */
function EditGroupDialog({
  open,
  isNew,
  draft,
  setDraft,
  catalog,
  pending,
  onSubmit,
  onClose,
}: {
  open: boolean;
  isNew: boolean;
  draft: GroupDraft;
  setDraft: React.Dispatch<React.SetStateAction<GroupDraft>>;
  catalog: Array<{ name: string; description: string; default: boolean }>;
  pending: boolean;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isNew ? "Nowa rola użytkowników" : "Edytuj rolę"}
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
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
          <p className="text-[11px] text-[var(--text-muted)] mb-2">
            Role oznaczone „domyślna" są i tak przyznawane każdemu zalogowanemu —
            zaznaczasz je dla przejrzystości (żeby szablon jawnie wymieniał
            wszystkie uprawnienia, jakie oferuje rola).
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
                    disabled={pending}
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
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Anuluj
          </Button>
          <Button
            type="submit"
            loading={pending}
            leftIcon={!pending && <Check className="w-4 h-4" aria-hidden="true" />}
          >
            {isNew ? "Utwórz" : "Zapisz"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function AssignUserDialog({
  group,
  onClose,
  onAssign,
  pendingUser,
}: {
  group: GroupSummary | null;
  onClose: () => void;
  onAssign: (userId: string, group: GroupSummary) => Promise<void>;
  pendingUser: string | null;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    if (group) {
      setQuery("");
      setHits([]);
      setError(null);
    }
  }, [group?.id]);

  const runSearch = useCallback(
    async (q: string) => {
      const myReq = ++reqRef.current;
      setSearching(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        qs.set("max", "20");
        if (q.trim()) qs.set("search", q.trim());
        const data = await api.get<{ users: SearchHit[] }>(
          `/api/admin/users?${qs.toString()}`,
        );
        if (myReq !== reqRef.current) return;
        const existingIds = new Set((group?.members ?? []).map((u) => u.id));
        setHits((data.users ?? []).filter((u) => !existingIds.has(u.id)));
      } catch (err) {
        if (myReq !== reqRef.current) return;
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się wyszukać użytkowników",
        );
      } finally {
        if (myReq === reqRef.current) setSearching(false);
      }
    },
    [group?.members],
  );

  useEffect(() => {
    if (!group) return;
    const h = setTimeout(() => void runSearch(query), 250);
    return () => clearTimeout(h);
  }, [query, group, runSearch]);

  if (!group) return null;

  return (
    <Dialog
      open={group !== null}
      onClose={onClose}
      title={`Przypisz użytkownika do roli „${group.name}"`}
      size="md"
    >
      <div className="space-y-3">
        <p className="text-xs text-[var(--text-muted)]">
          Wybrany użytkownik <strong>dostanie wszystkie uprawnienia</strong> z tej
          roli, zachowując te, które miał wcześniej. Operacja jest odwracalna —
          odpinając go z roli stracisz tylko te uprawnienia, które dziedziczył z
          niej.
        </p>
        <Input
          placeholder="Email, imię, nazwisko, login…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          leftIcon={<Search className="w-4 h-4" aria-hidden="true" />}
          autoFocus
        />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="max-h-80 overflow-y-auto border border-[var(--border-subtle)] rounded-lg divide-y divide-[var(--border-subtle)]">
          {searching && hits.length === 0 ? (
            <p className="py-6 text-center text-xs text-[var(--text-muted)]">
              Szukam…
            </p>
          ) : hits.length === 0 ? (
            <p className="py-6 text-center text-xs text-[var(--text-muted)]">
              {query
                ? "Brak pasujących użytkowników spoza tej roli."
                : "Wpisz email lub imię, aby wyszukać."}
            </p>
          ) : (
            hits.map((u) => (
              <button
                key={u.id}
                type="button"
                disabled={pendingUser === u.id}
                onClick={() => void onAssign(u.id, group)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--bg-main)]/60 disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[var(--text-main)] truncate">
                    {displayName(u)}
                  </span>
                  {u.email && (
                    <span className="block text-[11px] text-[var(--text-muted)] truncate">
                      {u.email}
                    </span>
                  )}
                </span>
                <UserPlus className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
              </button>
            ))
          )}
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Zamknij
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
