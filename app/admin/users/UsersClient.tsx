"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  KeyRound,
  Link2,
  Link2Off,
  Loader2,
  LogOut,
  Mail,
  Monitor,
  Pencil,
  Search,
  Send,
  Shield,
  Trash2,
  Unlock,
  UserPlus,
  X,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  FieldWrapper,
  Input,
  PageShell,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { ApiRequestError } from "@/lib/api-client";
import { PermissionsTree } from "./PermissionsTree";
import {
  adminUserService,
  type AdminIntegrationStatus,
  type AdminRole,
  type AdminUserSession,
  type AdminUserSummary,
} from "@/app/account/account-service";

interface UsersClientProps {
  selfId?: string;
  userLabel?: string;
  userEmail?: string;
}

const PAGE_SIZE = 25;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const PRESENCE_POLL_MS = 60 * 1000;

function formatDate(ts: number | null) {
  if (!ts) return "—";
  const ms = ts > 100000000000 ? ts : ts * 1000;
  return new Date(ms).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fullName(u: AdminUserSummary) {
  return (
    [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.username
  );
}

type PresenceMap = Record<string, number>;
type IntegrationsMap = Record<string, AdminIntegrationStatus>;
type LockMap = Record<
  string,
  { numFailures: number; disabled: boolean; lastFailure: number | null }
>;

export function UsersClient({ selfId, userLabel, userEmail }: UsersClientProps) {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [first, setFirst] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sessionsFor, setSessionsFor] = useState<AdminUserSummary | null>(null);
  const [passwordFor, setPasswordFor] = useState<AdminUserSummary | null>(null);
  const [rolesFor, setRolesFor] = useState<AdminUserSummary | null>(null);
  const [editFor, setEditFor] = useState<AdminUserSummary | null>(null);
  const [actionsFor, setActionsFor] = useState<AdminUserSummary | null>(null);
  const [presence, setPresence] = useState<PresenceMap>({});
  const [integrations, setIntegrations] = useState<IntegrationsMap>({});
  const [locks, setLocks] = useState<LockMap>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminUserService.list({
        search: search || undefined,
        first,
        max: PAGE_SIZE,
      });
      setUsers(res.users);
      setTotal(res.total);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się pobrać listy użytkowników",
      );
    } finally {
      setLoading(false);
    }
  }, [search, first]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const loadPresenceAndIntegrations = useCallback(
    async (targetUsers: AdminUserSummary[]) => {
      if (targetUsers.length === 0) return;
      const results = await Promise.all(
        targetUsers.map(async (u) => {
          const [sessionsRes, integrationsRes, lockRes] =
            await Promise.allSettled([
              adminUserService.sessions(u.id),
              adminUserService.getIntegrations(u.id),
              adminUserService.getLockStatus(u.id),
            ]);
          const lastAccess =
            sessionsRes.status === "fulfilled"
              ? sessionsRes.value.sessions.reduce(
                  (max, s) => Math.max(max, s.lastAccess ?? 0),
                  0,
                )
              : 0;
          const integ =
            integrationsRes.status === "fulfilled"
              ? integrationsRes.value
              : null;
          const lock =
            lockRes.status === "fulfilled"
              ? {
                  numFailures: lockRes.value.numFailures,
                  disabled: lockRes.value.disabled,
                  lastFailure: lockRes.value.lastFailure,
                }
              : null;
          return { id: u.id, lastAccess, integ, lock };
        }),
      );
      setPresence((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.lastAccess > 0) next[r.id] = r.lastAccess;
        }
        return next;
      });
      setIntegrations((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.integ) next[r.id] = r.integ;
        }
        return next;
      });
      setLocks((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.lock) next[r.id] = r.lock;
        }
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (users.length === 0) return;
    void loadPresenceAndIntegrations(users);
    const t = setInterval(() => {
      void loadPresenceAndIntegrations(users);
    }, PRESENCE_POLL_MS);
    return () => clearInterval(t);
  }, [users, loadPresenceAndIntegrations]);

  const onSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setFirst(0);
      setSearch(searchInput.trim());
    },
    [searchInput],
  );

  const toggleEnabled = useCallback(
    async (user: AdminUserSummary) => {
      if (user.id === selfId) return;
      setPending(user.id);
      setError(null);
      try {
        await adminUserService.update(user.id, { enabled: !user.enabled });
        setUsers((prev) =>
          prev.map((u) =>
            u.id === user.id ? { ...u, enabled: !user.enabled } : u,
          ),
        );
        setNotice(
          !user.enabled
            ? `Konto ${user.email ?? user.username} odblokowane`
            : `Konto ${user.email ?? user.username} zablokowane`,
        );
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się zmienić statusu konta",
        );
      } finally {
        setPending(null);
      }
    },
    [selfId],
  );

  const deleteUser = useCallback(
    async (user: AdminUserSummary) => {
      if (user.id === selfId) return;
      if (
        !window.confirm(
          `Na pewno usunąć użytkownika ${user.email ?? user.username}? Operacja jest nieodwracalna.`,
        )
      ) {
        return;
      }
      setPending(user.id);
      setError(null);
      try {
        await adminUserService.remove(user.id);
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        setTotal((t) => Math.max(0, t - 1));
        setNotice(`Użytkownik ${user.email ?? user.username} usunięty`);
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się usunąć użytkownika",
        );
      } finally {
        setPending(null);
      }
    },
    [selfId],
  );

  const unlockUser = useCallback(async (user: AdminUserSummary) => {
    setPending(user.id);
    setError(null);
    try {
      await adminUserService.unlock(user.id);
      setLocks((prev) => ({
        ...prev,
        [user.id]: { numFailures: 0, disabled: false, lastFailure: null },
      }));
      setNotice(`Blokada brute-force zdjęta dla ${user.email ?? user.username}`);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zdjąć blokady",
      );
    } finally {
      setPending(null);
    }
  }, []);

  const unlinkIntegration = useCallback(
    async (user: AdminUserSummary, provider: "google" | "kadromierz") => {
      const label = provider === "google" ? "Google" : "Kadromierz";
      if (
        !window.confirm(
          `Odłączyć integrację ${label} dla ${user.email ?? user.username}?`,
        )
      ) {
        return;
      }
      setPending(user.id);
      setError(null);
      try {
        await adminUserService.unlinkIntegration(user.id, provider);
        setIntegrations((prev) => {
          const current = prev[user.id];
          if (!current) return prev;
          return {
            ...prev,
            [user.id]: {
              ...current,
              [provider]: {
                ...current[provider],
                connected: false,
              },
            },
          };
        });
        setNotice(`Integracja ${label} odłączona od ${user.email ?? user.username}`);
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : `Nie udało się odłączyć integracji ${label}`,
        );
      } finally {
        setPending(null);
      }
    },
    [],
  );

  const pages = useMemo(
    () => ({
      start: first + 1,
      end: Math.min(first + PAGE_SIZE, total),
      total,
      hasPrev: first > 0,
      hasNext: first + PAGE_SIZE < total,
    }),
    [first, total],
  );

  return (
    <PageShell
      maxWidth="2xl"
      header={
        <AppHeader
          backHref="/dashboard"
          title="Użytkownicy"
          userLabel={userLabel}
          userSubLabel={userEmail}
        />
      }
    >
      <section className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--text-muted)]">
            Zarządzaj kontami użytkowników realmu Keycloak — zobacz kto ma
            jakie uprawnienia w drzewku lub edytuj konkretnego użytkownika z
            listy poniżej.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            leftIcon={<UserPlus className="w-4 h-4" aria-hidden="true" />}
            onClick={() => setInviteOpen(true)}
          >
            Zaproś użytkownika
          </Button>
        </div>
      </section>

      <div className="mb-6">
        <PermissionsTree selfId={selfId} />
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <Card padding="md" className="mb-4">
        <form onSubmit={onSearchSubmit} className="flex gap-2 items-end">
          <FieldWrapper id="user-search" label="Szukaj" className="flex-1">
            <Input
              id="user-search"
              placeholder="Email, imię, nazwisko, login..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              leftIcon={<Search className="w-4 h-4" aria-hidden="true" />}
            />
          </FieldWrapper>
          <Button type="submit" variant="secondary">
            Szukaj
          </Button>
          {search && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearch("");
                setSearchInput("");
                setFirst(0);
              }}
            >
              Wyczyść
            </Button>
          )}
        </form>
      </Card>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border-subtle)]">
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-4 py-3 font-medium">Użytkownik</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Integracje</th>
                <th className="px-4 py-3 font-medium">Utworzono</th>
                <th className="px-4 py-3 font-medium text-right">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[var(--text-muted)]">
                    <Loader2 className="w-5 h-5 animate-spin inline-block" aria-hidden="true" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[var(--text-muted)]">
                    Brak użytkowników spełniających kryteria.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isSelf = u.id === selfId;
                  const isPending = pending === u.id;
                  const lastAccess = presence[u.id];
                  const isOnline =
                    !!lastAccess && Date.now() - lastAccess * 1000 < ONLINE_WINDOW_MS;
                  const integ = integrations[u.id];
                  const lock = locks[u.id];
                  const locked = lock?.disabled || (lock?.numFailures ?? 0) > 0;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-main)]"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--text-main)]">
                          {fullName(u)}
                          {isSelf && (
                            <Badge tone="accent" className="ml-2">Ty</Badge>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {u.username}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-main)]">
                        {u.email ?? "—"}
                        {u.email && !u.emailVerified && (
                          <Badge tone="warning" className="ml-2">
                            Nieaktywowany
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {u.enabled ? (
                            <Badge tone="success">
                              <Check className="w-3 h-3" aria-hidden="true" />
                              Aktywny
                            </Badge>
                          ) : (
                            <Badge tone="danger">
                              <Ban className="w-3 h-3" aria-hidden="true" />
                              Zablokowany
                            </Badge>
                          )}
                          {isOnline && (
                            <Badge
                              tone="success"
                              title={`Ostatnio widziany: ${formatDate(lastAccess)}`}
                            >
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                              Online
                            </Badge>
                          )}
                          {u.requiredActions.length > 0 && (
                            <Badge
                              tone="info"
                              title={u.requiredActions.join(", ")}
                            >
                              {u.requiredActions.length} wymagane
                            </Badge>
                          )}
                          {locked && (
                            <Badge
                              tone="warning"
                              title={`${lock?.numFailures ?? 0} nieudanych prób${lock?.disabled ? " · zablokowany" : ""}`}
                            >
                              <AlertTriangle
                                className="w-3 h-3"
                                aria-hidden="true"
                              />
                              {lock?.disabled
                                ? "Brute-force lock"
                                : `${lock?.numFailures ?? 0} błędów`}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge
                            tone={integ?.google.connected ? "success" : "neutral"}
                            title={
                              integ?.google.connected
                                ? `Google: ${integ.google.username ?? ""}`
                                : "Google niepołączone"
                            }
                          >
                            Google {integ?.google.connected ? "✓" : "—"}
                          </Badge>
                          <Badge
                            tone={
                              integ?.kadromierz.connected ? "success" : "neutral"
                            }
                            title={
                              integ?.kadromierz.connected
                                ? `Kadromierz: #${integ.kadromierz.employeeId ?? ""}`
                                : "Kadromierz niepołączone"
                            }
                          >
                            Kadromierz {integ?.kadromierz.connected ? "✓" : "—"}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {formatDate(u.createdTimestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Edytuj dane"
                            onClick={() => setEditFor(u)}
                            disabled={isPending}
                          >
                            <Pencil className="w-4 h-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Sesje"
                            onClick={() => setSessionsFor(u)}
                            disabled={isPending}
                          >
                            <Monitor className="w-4 h-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Wyślij email z akcjami"
                            onClick={() => setActionsFor(u)}
                            disabled={isPending || !u.email}
                          >
                            <Send className="w-4 h-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Reset hasła"
                            onClick={() => setPasswordFor(u)}
                            disabled={isPending}
                          >
                            <KeyRound className="w-4 h-4" aria-hidden="true" />
                          </Button>
                          {locked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Zdejmij blokadę brute-force"
                              onClick={() => void unlockUser(u)}
                              loading={isPending}
                              disabled={isPending}
                              className="text-yellow-500 hover:text-yellow-600"
                            >
                              <Unlock className="w-4 h-4" aria-hidden="true" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Role"
                            onClick={() => setRolesFor(u)}
                            disabled={isPending}
                          >
                            <Shield className="w-4 h-4" aria-hidden="true" />
                          </Button>
                          {integ?.google.connected && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Odłącz Google"
                              onClick={() => void unlinkIntegration(u, "google")}
                              loading={isPending}
                              disabled={isPending}
                            >
                              <Link2Off className="w-4 h-4" aria-hidden="true" />
                            </Button>
                          )}
                          {integ?.kadromierz.connected && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Odłącz Kadromierz"
                              onClick={() =>
                                void unlinkIntegration(u, "kadromierz")
                              }
                              loading={isPending}
                              disabled={isPending}
                            >
                              <Link2 className="w-4 h-4" aria-hidden="true" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            title={u.enabled ? "Zablokuj" : "Odblokuj"}
                            onClick={() => void toggleEnabled(u)}
                            loading={isPending}
                            disabled={isPending || isSelf}
                          >
                            {u.enabled ? (
                              <Ban className="w-4 h-4" aria-hidden="true" />
                            ) : (
                              <Check className="w-4 h-4" aria-hidden="true" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Usuń"
                            onClick={() => void deleteUser(u)}
                            loading={isPending}
                            disabled={isPending || isSelf}
                            className="text-red-500 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
            <span>
              {pages.start}–{pages.end} z {pages.total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!pages.hasPrev || loading}
                onClick={() => setFirst((f) => Math.max(0, f - PAGE_SIZE))}
              >
                Poprzednia
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!pages.hasNext || loading}
                onClick={() => setFirst((f) => f + PAGE_SIZE)}
              >
                Następna
              </Button>
            </div>
          </div>
        )}
      </Card>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(email) => {
          setInviteOpen(false);
          setNotice(`Wysłano zaproszenie do ${email}`);
          setFirst(0);
          void refresh();
        }}
      />

      <SessionsDialog
        user={sessionsFor}
        onClose={() => setSessionsFor(null)}
        onAllTerminated={() => setNotice("Sesje użytkownika zakończone")}
      />

      <PasswordResetDialog
        user={passwordFor}
        onClose={() => setPasswordFor(null)}
        onDone={(msg) => {
          setPasswordFor(null);
          setNotice(msg);
        }}
      />

      <RolesDialog
        user={rolesFor}
        onClose={() => setRolesFor(null)}
        onSaved={() => {
          setRolesFor(null);
          setNotice("Role zaktualizowane");
        }}
      />

      <EditUserDialog
        user={editFor}
        onClose={() => setEditFor(null)}
        onSaved={(updated) => {
          setEditFor(null);
          setUsers((prev) =>
            prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)),
          );
          setNotice(`Dane ${updated.email ?? updated.username} zaktualizowane`);
        }}
      />

      <ActionsDialog
        user={actionsFor}
        onClose={() => setActionsFor(null)}
        onSent={(msg) => {
          setActionsFor(null);
          setNotice(msg);
        }}
      />
    </PageShell>
  );
}

function InviteDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setFirstName("");
      setLastName("");
      setError(null);
      setTimeout(() => emailRef.current?.focus(), 50);
    }
  }, [open]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !trimmedEmail.includes("@")) {
        setError("Podaj prawidłowy email");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await adminUserService.invite({
          email: trimmedEmail,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        });
        onInvited(trimmedEmail);
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się wysłać zaproszenia",
        );
      } finally {
        setLoading(false);
      }
    },
    [email, firstName, lastName, onInvited],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Zaproś użytkownika"
      description="Utworzy konto i wyśle email z linkiem do ustawienia hasła i weryfikacji."
      labelledById="invite-user-title"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Anuluj
          </Button>
          <Button
            type="submit"
            form="invite-user-form"
            loading={loading}
            leftIcon={<Mail className="w-4 h-4" aria-hidden="true" />}
          >
            Wyślij zaproszenie
          </Button>
        </>
      }
    >
      <form id="invite-user-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <FieldWrapper id="invite-email" label="Email" required>
          <Input
            ref={emailRef}
            id="invite-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jan.kowalski@example.com"
          />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper id="invite-first" label="Imię">
            <Input
              id="invite-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper id="invite-last" label="Nazwisko">
            <Input
              id="invite-last"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </FieldWrapper>
        </div>
      </form>
    </Dialog>
  );
}

function SessionsDialog({
  user,
  onClose,
  onAllTerminated,
}: {
  user: AdminUserSummary | null;
  onClose: () => void;
  onAllTerminated: () => void;
}) {
  const [sessions, setSessions] = useState<AdminUserSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terminating, setTerminating] = useState(false);

  useEffect(() => {
    if (!user) return;
    setSessions([]);
    setError(null);
    setLoading(true);
    adminUserService
      .sessions(user.id)
      .then((res) => setSessions(res.sessions))
      .catch((err) =>
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się pobrać sesji",
        ),
      )
      .finally(() => setLoading(false));
  }, [user]);

  const terminateAll = useCallback(async () => {
    if (!user) return;
    setTerminating(true);
    setError(null);
    try {
      await adminUserService.logoutAll(user.id);
      setSessions([]);
      onAllTerminated();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zakończyć sesji",
      );
    } finally {
      setTerminating(false);
    }
  }, [user, onAllTerminated, onClose]);

  return (
    <Dialog
      open={!!user}
      onClose={onClose}
      size="lg"
      title={user ? `Sesje: ${fullName(user)}` : ""}
      description={user?.email ?? undefined}
      labelledById="admin-sessions-title"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            <X className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Zamknij
          </Button>
          {sessions.length > 0 && (
            <Button
              variant="danger"
              loading={terminating}
              leftIcon={<LogOut className="w-4 h-4" aria-hidden="true" />}
              onClick={() => void terminateAll()}
            >
              Wyloguj wszystkie
            </Button>
          )}
        </>
      }
    >
      {error && (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Ładowanie…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Brak aktywnych sesji.</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-[var(--border-subtle)]"
            >
              <div>
                <div className="font-mono text-xs text-[var(--text-muted)]">
                  {s.ipAddress}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  Start: {formatDate(s.started)} · Ostatnio:{" "}
                  {formatDate(s.lastAccess)}
                </div>
              </div>
              {s.clients && Object.keys(s.clients).length > 0 && (
                <div className="text-xs text-[var(--text-muted)] text-right">
                  {Object.values(s.clients).join(", ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function EditUserDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUserSummary | null;
  onClose: () => void;
  onSaved: (updated: AdminUserSummary) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setEmail(user.email ?? "");
      setError(null);
    }
  }, [user]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;
      const cleanEmail = email.trim().toLowerCase();
      if (cleanEmail && !cleanEmail.includes("@")) {
        setError("Nieprawidłowy email");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await adminUserService.update(user.id, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: cleanEmail,
        });
        onSaved({
          ...user,
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          email: cleanEmail || null,
          emailVerified:
            cleanEmail && cleanEmail !== user.email
              ? false
              : user.emailVerified,
        });
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się zapisać zmian",
        );
      } finally {
        setLoading(false);
      }
    },
    [user, firstName, lastName, email, onSaved],
  );

  return (
    <Dialog
      open={!!user}
      onClose={onClose}
      title={user ? `Edycja: ${fullName(user)}` : ""}
      description={user?.username}
      labelledById="edit-user-title"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Anuluj
          </Button>
          <Button
            type="submit"
            form="edit-user-form"
            loading={loading}
            leftIcon={<Check className="w-4 h-4" aria-hidden="true" />}
          >
            Zapisz
          </Button>
        </>
      }
    >
      <form id="edit-user-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <FieldWrapper id="edit-first" label="Imię">
            <Input
              id="edit-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </FieldWrapper>
          <FieldWrapper id="edit-last" label="Nazwisko">
            <Input
              id="edit-last"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </FieldWrapper>
        </div>
        <FieldWrapper
          id="edit-email"
          label="Email"
          hint={
            email.trim().toLowerCase() !== (user?.email ?? "")
              ? "Zmiana emaila zresetuje flagę weryfikacji."
              : undefined
          }
        >
          <Input
            id="edit-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FieldWrapper>
      </form>
    </Dialog>
  );
}

function PasswordResetDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUserSummary | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"email" | "manual">("email");
  const [password, setPassword] = useState("");
  const [temporary, setTemporary] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setMode("email");
      setPassword("");
      setTemporary(true);
      setError(null);
    }
  }, [user]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        if (mode === "email") {
          await adminUserService.resetPassword(user.id, { sendEmail: true });
          onDone(`Wysłano link resetu hasła do ${user.email ?? user.username}`);
        } else {
          if (!password || password.length < 8) {
            setError("Hasło musi mieć minimum 8 znaków");
            setLoading(false);
            return;
          }
          await adminUserService.resetPassword(user.id, {
            password,
            temporary,
            sendEmail: false,
          });
          onDone(
            `Hasło dla ${user.email ?? user.username} zostało zmienione${temporary ? " (wymagana zmiana)" : ""}`,
          );
        }
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się zresetować hasła",
        );
      } finally {
        setLoading(false);
      }
    },
    [user, mode, password, temporary, onDone],
  );

  return (
    <Dialog
      open={!!user}
      onClose={onClose}
      title={user ? `Reset hasła: ${fullName(user)}` : ""}
      description={user?.email ?? undefined}
      labelledById="password-reset-title"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Anuluj
          </Button>
          <Button
            type="submit"
            form="password-reset-form"
            loading={loading}
            leftIcon={<KeyRound className="w-4 h-4" aria-hidden="true" />}
          >
            {mode === "email" ? "Wyślij link" : "Ustaw hasło"}
          </Button>
        </>
      }
    >
      <form id="password-reset-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "email" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setMode("email")}
          >
            Wyślij email
          </Button>
          <Button
            type="button"
            variant={mode === "manual" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setMode("manual")}
          >
            Ustaw ręcznie
          </Button>
        </div>
        {mode === "email" ? (
          <p className="text-sm text-[var(--text-muted)]">
            Użytkownik otrzyma email z linkiem do ustawienia nowego hasła
            (ważny 24h).
          </p>
        ) : (
          <>
            <FieldWrapper
              id="new-password"
              label="Nowe hasło"
              hint="Minimum 8 znaków"
              required
            >
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FieldWrapper>
            <label className="flex items-center gap-2 text-sm text-[var(--text-main)]">
              <input
                type="checkbox"
                checked={temporary}
                onChange={(e) => setTemporary(e.target.checked)}
                className="rounded border-[var(--border-subtle)]"
              />
              Wymagaj zmiany hasła przy następnym logowaniu
            </label>
          </>
        )}
      </form>
    </Dialog>
  );
}

function RolesDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUserSummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setRoles([]);
    setSelected(new Set());
    setInitial(new Set());
    setError(null);
    setLoading(true);
    adminUserService
      .listRoles(user.id)
      .then((res) => {
        setRoles(res.roles);
        const assigned = new Set(
          res.roles.filter((r) => r.assigned).map((r) => r.name),
        );
        setSelected(assigned);
        setInitial(new Set(assigned));
      })
      .catch((err) =>
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się pobrać ról",
        ),
      )
      .finally(() => setLoading(false));
  }, [user]);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const diff = useMemo(() => {
    const add: string[] = [];
    const remove: string[] = [];
    for (const name of selected) if (!initial.has(name)) add.push(name);
    for (const name of initial) if (!selected.has(name)) remove.push(name);
    return { add, remove };
  }, [selected, initial]);

  const dirty = diff.add.length > 0 || diff.remove.length > 0;

  const save = useCallback(async () => {
    if (!user || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      await adminUserService.updateRoles(user.id, diff);
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zapisać ról",
      );
    } finally {
      setSaving(false);
    }
  }, [user, dirty, diff, onSaved]);

  return (
    <Dialog
      open={!!user}
      onClose={onClose}
      size="lg"
      title={user ? `Role: ${fullName(user)}` : ""}
      description="Realm roles — RBAC"
      labelledById="roles-title"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Anuluj
          </Button>
          <Button
            onClick={() => void save()}
            loading={saving}
            disabled={!dirty}
            leftIcon={<Shield className="w-4 h-4" aria-hidden="true" />}
          >
            Zapisz {dirty && `(${diff.add.length}+ / ${diff.remove.length}-)`}
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Ładowanie…</p>
      ) : roles.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Brak dostępnych ról.
        </p>
      ) : (
        <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
          {roles.map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-3 px-3 py-2 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-main)]"
            >
              <input
                type="checkbox"
                checked={selected.has(r.name)}
                onChange={() => toggle(r.name)}
                className="mt-1 rounded border-[var(--border-subtle)]"
                id={`role-${r.id}`}
              />
              <label
                htmlFor={`role-${r.id}`}
                className="flex-1 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text-main)]">
                    {r.name}
                  </span>
                  {r.composite && (
                    <Badge tone="info">kompozytowa</Badge>
                  )}
                </div>
                {r.description && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {r.description}
                  </p>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

const AVAILABLE_ACTIONS: Array<{
  id: string;
  label: string;
  desc: string;
  default?: boolean;
}> = [
  {
    id: "UPDATE_PASSWORD",
    label: "Ustawienie / zmiana hasła",
    desc: "Użytkownik musi ustawić hasło przy najbliższym logowaniu.",
    default: true,
  },
  {
    id: "VERIFY_EMAIL",
    label: "Weryfikacja adresu email",
    desc: "Link weryfikacyjny do potwierdzenia skrzynki.",
    default: true,
  },
  {
    id: "UPDATE_PROFILE",
    label: "Uzupełnienie danych profilu",
    desc: "Imię, nazwisko, email — wymaga edycji przed kontynuacją.",
  },
  {
    id: "CONFIGURE_TOTP",
    label: "Konfiguracja 2FA (TOTP)",
    desc: "Wymusza dodanie aplikacji 2FA (Google Authenticator itp.).",
  },
  {
    id: "webauthn-register",
    label: "Rejestracja klucza sprzętowego (WebAuthn)",
    desc: "Dodanie YubiKey / klucza bezpieczeństwa.",
  },
  {
    id: "TERMS_AND_CONDITIONS",
    label: "Akceptacja regulaminu",
    desc: "Pokaż regulamin i wymuś akceptację.",
  },
  {
    id: "delete_account",
    label: "Usunięcie konta",
    desc: "Daje użytkownikowi self-service opcję usunięcia konta.",
  },
];

function ActionsDialog({
  user,
  onClose,
  onSent,
}: {
  user: AdminUserSummary | null;
  onClose: () => void;
  onSent: (msg: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendEmail, setSendEmail] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const initial = new Set<string>();
    if (user.requiredActions.length > 0) {
      user.requiredActions.forEach((a) => initial.add(a));
    } else {
      AVAILABLE_ACTIONS.filter((a) => a.default).forEach((a) =>
        initial.add(a.id),
      );
    }
    setSelected(initial);
    setSendEmail(true);
    setError(null);
  }, [user]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;
      if (selected.size === 0) {
        setError("Wybierz przynajmniej jedną akcję.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await adminUserService.sendActions(user.id, {
          actions: Array.from(selected),
          sendEmail,
        });
        onSent(
          sendEmail
            ? `Wysłano email do ${user.email ?? user.username} (${selected.size} akcji)`
            : `Kolejka required-actions zaktualizowana dla ${user.email ?? user.username}`,
        );
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się wysłać akcji",
        );
      } finally {
        setLoading(false);
      }
    },
    [user, selected, sendEmail, onSent],
  );

  return (
    <Dialog
      open={!!user}
      onClose={onClose}
      size="lg"
      title={user ? `Wyślij akcje: ${fullName(user)}` : ""}
      description={user?.email ?? undefined}
      labelledById="actions-dialog-title"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Anuluj
          </Button>
          <Button
            type="submit"
            form="actions-dialog-form"
            loading={loading}
            disabled={selected.size === 0}
            leftIcon={
              sendEmail ? (
                <Mail className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Shield className="w-4 h-4" aria-hidden="true" />
              )
            }
          >
            {sendEmail ? "Wyślij email" : "Dodaj do kolejki"}
          </Button>
        </>
      }
    >
      <form id="actions-dialog-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <p className="text-sm text-[var(--text-muted)]">
          Wybierz akcje, które użytkownik musi wykonać. Jeśli zaznaczysz
          &bdquo;Wyślij email&rdquo;, Keycloak prześle link otwierający formularz
          (wymaga skonfigurowanego SMTP). W przeciwnym razie akcje zostaną
          dodane do kolejki required-actions i pojawią się przy następnym
          logowaniu użytkownika.
        </p>
        <ul className="space-y-1 max-h-[50vh] overflow-y-auto">
          {AVAILABLE_ACTIONS.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-3 px-3 py-2 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-main)]"
            >
              <input
                type="checkbox"
                checked={selected.has(a.id)}
                onChange={() => toggle(a.id)}
                className="mt-1 rounded border-[var(--border-subtle)]"
                id={`action-${a.id}`}
              />
              <label
                htmlFor={`action-${a.id}`}
                className="flex-1 cursor-pointer"
              >
                <div className="font-medium text-sm text-[var(--text-main)]">
                  {a.label}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {a.desc}
                </p>
                <code className="text-[10px] text-[var(--text-muted)]/70 mt-1 block">
                  {a.id}
                </code>
              </label>
            </li>
          ))}
        </ul>
        <label className="flex items-center gap-2 text-sm text-[var(--text-main)] pt-1 border-t border-[var(--border-subtle)]">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="rounded border-[var(--border-subtle)]"
          />
          Wyślij też email z linkiem do wykonania akcji
        </label>
      </form>
    </Dialog>
  );
}
