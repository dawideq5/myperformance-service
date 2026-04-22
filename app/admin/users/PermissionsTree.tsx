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
  ChevronRight,
  Plus,
  Search,
  Shield,
  UserPlus,
  Users as UsersIcon,
  X,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  Input,
} from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";

interface RoleUser {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  enabled: boolean;
}

interface RoleNode {
  name: string;
  description: string;
  default: boolean;
  users: RoleUser[];
}

interface ServiceNode {
  id: string;
  label: string;
  description?: string;
  roles: RoleNode[];
}

interface SearchHit {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

function displayName(u: {
  firstName: string | null;
  lastName: string | null;
  username: string;
  email?: string | null;
}) {
  const fn = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return fn || u.email || u.username;
}

export function PermissionsTree({ selfId }: { selfId?: string }) {
  const [services, setServices] = useState<ServiceNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({});
  const [assignOpen, setAssignOpen] = useState<RoleNode | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ services: ServiceNode[] }>(
        "/api/admin/roles/tree",
      );
      setServices(data.services ?? []);
      setExpanded((prev) =>
        Object.keys(prev).length
          ? prev
          : Object.fromEntries(data.services.map((s) => [s.id, true])),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się pobrać drzewka");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalUsers = useMemo(
    () =>
      services.reduce(
        (acc, svc) =>
          acc + svc.roles.reduce((s, r) => s + r.users.length, 0),
        0,
      ),
    [services],
  );
  const totalRoles = useMemo(
    () => services.reduce((acc, svc) => acc + svc.roles.length, 0),
    [services],
  );

  const toggleService = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleRole = (name: string) =>
    setExpandedRoles((prev) => ({ ...prev, [name]: !prev[name] }));

  const removeAssignment = useCallback(
    async (user: RoleUser, role: RoleNode) => {
      if (
        !confirm(
          `Odebrać ${displayName(user)} rolę „${role.name}"?`,
        )
      ) {
        return;
      }
      setPending(`${role.name}:${user.id}`);
      setFeedback(null);
      try {
        await api.post(`/api/admin/users/${user.id}/roles`, {
          remove: [role.name],
        });
        await load();
        setFeedback({
          tone: "success",
          message: `Odebrano „${role.name}" użytkownikowi ${displayName(user)}.`,
        });
      } catch (err) {
        setFeedback({
          tone: "error",
          message:
            err instanceof ApiRequestError
              ? err.message
              : "Nie udało się odebrać roli",
        });
      } finally {
        setPending(null);
      }
    },
    [load],
  );

  const assignUser = useCallback(
    async (userId: string, role: RoleNode) => {
      setPending(`assign:${role.name}`);
      setFeedback(null);
      try {
        await api.post(`/api/admin/users/${userId}/roles`, {
          add: [role.name],
        });
        await load();
        setAssignOpen(null);
        setFeedback({
          tone: "success",
          message: `Przypisano rolę „${role.name}".`,
        });
      } catch (err) {
        setFeedback({
          tone: "error",
          message:
            err instanceof ApiRequestError
              ? err.message
              : "Nie udało się przypisać roli",
        });
      } finally {
        setPending(null);
      }
    },
    [load],
  );

  return (
    <Card padding="lg" className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-main)]">
              Drzewko uprawnień
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Role realmu Keycloak pogrupowane logicznie per usługa. Klik w
              użytkownika → szczegóły jego konta; krzyżyk → odebranie roli.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Badge tone="neutral">
            <UsersIcon className="w-3 h-3 mr-1" aria-hidden="true" />
            {totalUsers} przypisań
          </Badge>
          <Badge tone="neutral">{totalRoles} ról</Badge>
        </div>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {feedback && <Alert tone={feedback.tone}>{feedback.message}</Alert>}

      {loading && services.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">
          Ładowanie drzewka…
        </p>
      ) : services.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">
          Brak zdefiniowanych ról w tym realmie.
        </p>
      ) : (
        <div className="space-y-2">
          {services.map((svc) => {
            const isOpen = expanded[svc.id] !== false;
            const counts = svc.roles.reduce((acc, r) => acc + r.users.length, 0);
            return (
              <div
                key={svc.id}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/60"
              >
                <button
                  type="button"
                  onClick={() => toggleService(svc.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-main)]/50 rounded-xl"
                >
                  <ChevronRight
                    className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isOpen ? "rotate-90" : ""}`}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-main)]">
                      {svc.label}
                    </p>
                    {svc.description && (
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {svc.description}
                      </p>
                    )}
                  </div>
                  <Badge tone="neutral">{svc.roles.length} ról</Badge>
                  <Badge tone={counts > 0 ? "accent" : "neutral"}>
                    {counts} osób
                  </Badge>
                </button>
                {isOpen && (
                  <div className="pl-8 pr-3 pb-3 space-y-2">
                    {svc.roles.map((role) => {
                      const roleOpen = expandedRoles[role.name] === true;
                      return (
                        <div
                          key={role.name}
                          className="rounded-lg border border-[var(--border-subtle)]/60 bg-[var(--bg-main)]/40"
                        >
                          <div className="flex items-center gap-2 px-3 py-2">
                            <button
                              type="button"
                              onClick={() => toggleRole(role.name)}
                              className="flex items-center gap-2 flex-1 min-w-0 text-left"
                            >
                              <ChevronRight
                                className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${roleOpen ? "rotate-90" : ""}`}
                                aria-hidden="true"
                              />
                              <code className="text-xs font-mono text-[var(--accent)]">
                                {role.name}
                              </code>
                              {role.default && (
                                <Badge tone="info">domyślna</Badge>
                              )}
                              <span className="text-xs text-[var(--text-muted)] truncate">
                                {role.description}
                              </span>
                            </button>
                            <Badge tone={role.users.length > 0 ? "success" : "neutral"}>
                              {role.users.length}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                              onClick={() => {
                                setAssignOpen(role);
                                setFeedback(null);
                              }}
                            >
                              Przypisz
                            </Button>
                          </div>
                          {roleOpen && (
                            <div className="px-3 pb-3">
                              {role.users.length === 0 ? (
                                <p className="text-xs text-[var(--text-muted)] py-2">
                                  Nikt nie ma jeszcze tej roli.
                                </p>
                              ) : (
                                <ul className="space-y-1">
                                  {role.users.map((u) => (
                                    <li
                                      key={u.id}
                                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--bg-card)]/70"
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
                                        {!u.enabled && (
                                          <Badge tone="warning" className="ml-2">
                                            dezaktywowany
                                          </Badge>
                                        )}
                                        {u.id === selfId && (
                                          <Badge tone="info" className="ml-2">
                                            to Ty
                                          </Badge>
                                        )}
                                      </span>
                                      {!role.default && (
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          aria-label="Odbierz rolę"
                                          loading={
                                            pending === `${role.name}:${u.id}`
                                          }
                                          onClick={() => removeAssignment(u, role)}
                                          className="text-red-500 hover:bg-red-500/10"
                                        >
                                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                                        </Button>
                                      )}
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
              </div>
            );
          })}
        </div>
      )}

      <AssignUserDialog
        role={assignOpen}
        onClose={() => setAssignOpen(null)}
        onAssign={assignUser}
        pending={pending?.startsWith("assign:") === true}
      />
    </Card>
  );
}

function AssignUserDialog({
  role,
  onClose,
  onAssign,
  pending,
}: {
  role: RoleNode | null;
  onClose: () => void;
  onAssign: (userId: string, role: RoleNode) => Promise<void>;
  pending: boolean;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  // Reset on open
  useEffect(() => {
    if (role) {
      setQuery("");
      setHits([]);
      setError(null);
    }
  }, [role?.name]);

  const runSearch = useCallback(
    async (q: string) => {
      const myReq = ++reqRef.current;
      setSearching(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        qs.set("max", "20");
        if (q.trim()) qs.set("search", q.trim());
        const data = await api.get<{
          users: SearchHit[];
        }>(`/api/admin/users?${qs.toString()}`);
        if (myReq !== reqRef.current) return;
        const existingIds = new Set((role?.users ?? []).map((u) => u.id));
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
    [role?.users],
  );

  useEffect(() => {
    if (!role) return;
    const h = setTimeout(() => void runSearch(query), 250);
    return () => clearTimeout(h);
  }, [query, role, runSearch]);

  if (!role) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
  };

  return (
    <Dialog
      open={role !== null}
      onClose={onClose}
      title={`Przypisz rolę „${role.name}"`}
      size="md"
    >
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-[var(--text-muted)]">
          Wybierz użytkownika, któremu chcesz nadać tę rolę. Lista wyklucza
          osoby, które już ją mają.
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
                ? "Brak pasujących użytkowników."
                : "Wpisz email lub imię, aby wyszukać."}
            </p>
          ) : (
            hits.map((u) => (
              <button
                key={u.id}
                type="button"
                disabled={pending}
                onClick={() => void onAssign(u.id, role)}
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
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Zamknij
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
