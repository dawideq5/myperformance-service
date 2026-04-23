"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  Check,
  ExternalLink,
  Loader2,
  Search,
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
  FieldWrapper,
  Input,
  PageShell,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { ApiRequestError } from "@/lib/api-client";
import {
  adminUserService,
  type AdminIntegrationStatus,
  type AdminUserSummary,
} from "@/app/account/account-service";

import { BulkAssignDialog } from "./BulkAssignDialog";
import { InviteDialog } from "./InviteDialog";
import { IamToolsPanel } from "./IamToolsPanel";

/**
 * Zakładka /admin/users — przebudowana od zera (2026-04-23).
 *
 * Clean enterprise-grade listing:
 *   - Lista userów z wyszukiwarką, paginacją, statusami (aktywny, email,
 *     integracje Google/Kadromierz, brute-force lock).
 *   - Akcje szybkie inline: Otwórz (→ /admin/users/[id]), Zablokuj/
 *     Odblokuj, Usuń, Odblokuj brute-force.
 *   - Bulk: zaznaczenie userów → modal przypisania roli.
 *   - Sekcja "Narzędzia IAM" z syncem KC, resync profili, migracją legacy
 *     i diagnostyką providerów.
 *
 * Co jest dostępne w /admin/users/[id] (zamiast duplikować w modalach):
 *   - edycja profilu, role per aplikacja, reset hasła, sesje, 2FA,
 *     WebAuthn, integracje Google/Kadromierz, activity log, send actions.
 *
 * Jeden plik, jeden widok — żadnych zagnieżdżonych dialog'ów edytujących.
 */

interface UsersClientProps {
  selfId?: string;
  userLabel?: string;
  userEmail?: string;
}

const PAGE_SIZE = 25;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const PRESENCE_POLL_MS = 60 * 1000;

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  const ms = ts > 100_000_000_000 ? ts : ts * 1000;
  return new Date(ms).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fullName(u: AdminUserSummary): string {
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
  // Data
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [first, setFirst] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Side panels
  const [presence, setPresence] = useState<PresenceMap>({});
  const [integrations, setIntegrations] = useState<IntegrationsMap>({});
  const [locks, setLocks] = useState<LockMap>({});

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals (jedyne dwa — invite + bulk)
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Feedback
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────
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

  // Presence + integrations + brute-force lock status — fetched in parallel
  // for all visible users, refreshed every minute.
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

  // ── Actions ─────────────────────────────────────────────────────────────
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
      setPendingId(user.id);
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
        setPendingId(null);
      }
    },
    [selfId],
  );

  const deleteUser = useCallback(
    async (user: AdminUserSummary) => {
      if (user.id === selfId) return;
      if (
        !window.confirm(
          `Usunąć użytkownika ${user.email ?? user.username}?\n\n` +
            `Konto Keycloak zostanie SKASOWANE. Operacja nieodwracalna.`,
        )
      ) {
        return;
      }
      setPendingId(user.id);
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
        setPendingId(null);
      }
    },
    [selfId],
  );

  const unlockUser = useCallback(async (user: AdminUserSummary) => {
    setPendingId(user.id);
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
      setPendingId(null);
    }
  }, []);

  // ── Selection ───────────────────────────────────────────────────────────
  const selectedUsers = useMemo(
    () => users.filter((u) => selectedIds.has(u.id)),
    [users, selectedIds],
  );

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const allIds = users.map((u) => u.id);
      const allSelected = allIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        for (const id of allIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of allIds) next.add(id);
      return next;
    });
  }, [users]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const allOnPageSelected =
    users.length > 0 && users.every((u) => selectedIds.has(u.id));
  const someOnPageSelected = users.some((u) => selectedIds.has(u.id));

  const pages = useMemo(
    () => ({
      start: total > 0 ? first + 1 : 0,
      end: Math.min(first + PAGE_SIZE, total),
      total,
      hasPrev: first > 0,
      hasNext: first + PAGE_SIZE < total,
    }),
    [first, total],
  );

  // ── Render ──────────────────────────────────────────────────────────────
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
        <div className="max-w-2xl">
          <p className="text-sm text-[var(--text-muted)]">
            Zarządzaj kontami użytkowników realmu Keycloak — zaproś nowych,
            przypisz role per aplikacja, wyślij akcje profilowe. Kliknij
            &bdquo;Otwórz&rdquo; aby edytować dane usera (rolę, hasło,
            sesje, integracje).
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            leftIcon={<UserPlus className="w-4 h-4" aria-hidden="true" />}
            onClick={() => setInviteOpen(true)}
          >
            Zaproś użytkownika
          </Button>
        </div>
      </section>

      <IamToolsPanel />

      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--accent)] bg-[var(--bg-surface)] shadow-md">
          <div className="text-sm text-[var(--text-main)]">
            Zaznaczono <strong>{selectedIds.size}</strong> użytkowników
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Shield className="w-4 h-4" aria-hidden="true" />}
              onClick={() => setBulkOpen(true)}
            >
              Przypisz rolę zbiorczo
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              <X className="w-4 h-4" aria-hidden="true" />
              Odznacz
            </Button>
          </div>
        </div>
      )}

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

      {/* Search */}
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

      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border-subtle)]">
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-3 py-3 font-medium w-[40px]">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate =
                          someOnPageSelected && !allOnPageSelected;
                      }
                    }}
                    onChange={toggleAllOnPage}
                    aria-label="Zaznacz wszystkich na stronie"
                    className="rounded border-[var(--border-subtle)]"
                  />
                </th>
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
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-[var(--text-muted)]"
                  >
                    <Loader2
                      className="w-5 h-5 animate-spin inline-block"
                      aria-hidden="true"
                    />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-[var(--text-muted)]"
                  >
                    Brak użytkowników spełniających kryteria.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === selfId}
                    isPending={pendingId === u.id}
                    isSelected={selectedIds.has(u.id)}
                    presence={presence[u.id]}
                    integrations={integrations[u.id]}
                    lock={locks[u.id]}
                    onToggleSelect={() => toggleSelected(u.id)}
                    onToggleEnabled={() => void toggleEnabled(u)}
                    onDelete={() => void deleteUser(u)}
                    onUnlock={() => void unlockUser(u)}
                  />
                ))
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

      {/* Modals */}
      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={({ email, roleAssignmentErrors }) => {
          setInviteOpen(false);
          if (roleAssignmentErrors.length > 0) {
            setNotice(
              `Zaproszenie wysłane do ${email}, ale ${roleAssignmentErrors.length} przypisań ról zawiodło — sprawdź logi.`,
            );
          } else {
            setNotice(`Wysłano zaproszenie do ${email}`);
          }
          setFirst(0);
          void refresh();
        }}
      />

      <BulkAssignDialog
        open={bulkOpen}
        users={selectedUsers}
        onClose={() => setBulkOpen(false)}
        onDone={() => {
          setBulkOpen(false);
          clearSelection();
          setNotice("Bulk assignment zakończony");
          void refresh();
        }}
      />
    </PageShell>
  );
}

// ── Wiersz tabeli — wydzielony żeby memoizować i odchudzić diff ────────────
function UserRow({
  user,
  isSelf,
  isPending,
  isSelected,
  presence,
  integrations,
  lock,
  onToggleSelect,
  onToggleEnabled,
  onDelete,
  onUnlock,
}: {
  user: AdminUserSummary;
  isSelf: boolean;
  isPending: boolean;
  isSelected: boolean;
  presence: number | undefined;
  integrations: AdminIntegrationStatus | undefined;
  lock: { numFailures: number; disabled: boolean; lastFailure: number | null } | undefined;
  onToggleSelect: () => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
  onUnlock: () => void;
}) {
  const isOnline =
    !!presence && Date.now() - presence * 1000 < ONLINE_WINDOW_MS;
  const locked = lock?.disabled || (lock?.numFailures ?? 0) > 0;

  return (
    <tr
      className={`border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-main)] ${
        isSelected ? "bg-[var(--bg-main)]" : ""
      }`}
    >
      <td className="px-3 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label={`Zaznacz ${user.email ?? user.username}`}
          className="rounded border-[var(--border-subtle)]"
        />
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-[var(--text-main)]">
          {fullName(user)}
          {isSelf && (
            <Badge tone="accent" className="ml-2">
              Ty
            </Badge>
          )}
        </div>
        <div className="text-xs text-[var(--text-muted)]">{user.username}</div>
      </td>
      <td className="px-4 py-3 text-[var(--text-main)]">
        {user.email ?? "—"}
        {user.email && !user.emailVerified && (
          <Badge tone="warning" className="ml-2">
            Nieaktywowany
          </Badge>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5 items-center">
          {user.enabled ? (
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
            <Badge tone="success" title={`Ostatnio: ${formatDate(presence ?? null)}`}>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Online
            </Badge>
          )}
          {user.requiredActions.length > 0 && (
            <Badge tone="info" title={user.requiredActions.join(", ")}>
              {user.requiredActions.length} wymagane
            </Badge>
          )}
          {locked && (
            <Badge
              tone="warning"
              title={`${lock?.numFailures ?? 0} nieudanych prób${
                lock?.disabled ? " · zablokowany" : ""
              }`}
            >
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              {lock?.disabled ? "Brute-force lock" : `${lock?.numFailures ?? 0} błędów`}
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge
            tone={integrations?.google.connected ? "success" : "neutral"}
            title={
              integrations?.google.connected
                ? `Google: ${integrations.google.username ?? ""}`
                : "Google niepołączone"
            }
          >
            Google {integrations?.google.connected ? "✓" : "—"}
          </Badge>
          <Badge
            tone={integrations?.kadromierz.connected ? "success" : "neutral"}
            title={
              integrations?.kadromierz.connected
                ? `Kadromierz: #${integrations.kadromierz.employeeId ?? ""}`
                : "Kadromierz niepołączone"
            }
          >
            Kadromierz {integrations?.kadromierz.connected ? "✓" : "—"}
          </Badge>
        </div>
      </td>
      <td className="px-4 py-3 text-[var(--text-muted)]">
        {formatDate(user.createdTimestamp)}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1">
          <Link
            href={`/admin/users/${user.id}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-main)] hover:bg-[var(--bg-surface)]"
            title="Otwórz szczegóły i edytuj"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            Otwórz
          </Link>
          {locked && (
            <Button
              variant="ghost"
              size="sm"
              title="Zdejmij blokadę brute-force"
              onClick={onUnlock}
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
            title={user.enabled ? "Zablokuj" : "Odblokuj"}
            onClick={onToggleEnabled}
            loading={isPending}
            disabled={isPending || isSelf}
          >
            {user.enabled ? (
              <Ban className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Check className="w-4 h-4" aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Usuń konto"
            onClick={onDelete}
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
}
