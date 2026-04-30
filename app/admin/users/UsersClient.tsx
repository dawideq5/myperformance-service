"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UserPlus } from "lucide-react";

import {
  Alert,
  Button,
  OnboardingCard,
  PageShell,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { ApiRequestError } from "@/lib/api-client";
import {
  adminUserService,
  permissionAreaService,
  type AdminUserSummary,
  type AreaSummary,
} from "@/app/account/account-service";
import {
  PAGE_SIZE,
  PRESENCE_POLL_MS,
  toggleAllSelection,
  toggleSelection,
  type IntegrationsMap,
  type LockMap,
  type PresenceMap,
} from "@/lib/services/users-service";
import { UsersFilters } from "@/components/admin/users/UsersFilters";
import { UsersList } from "@/components/admin/users/UsersList";
import {
  BulkGroupDialog,
  UsersBulkBar,
} from "@/components/admin/users/UsersBulkActions";

import { InviteDialog } from "./InviteDialog";
import { GroupsClient } from "../groups/GroupsClient";

/**
 * Zakładka /admin/users — przebudowana od zera (2026-04-23), faza-3 split
 * (2026-04-30): shell trzyma state + dispatch; rendering deleguje do
 * `components/admin/users/{UsersFilters,UsersList,UsersBulkActions}`.
 *
 * Pure helpery (formatDate, fullName, pagination, presence, selection)
 * mieszkają w `lib/services/users-service.ts`.
 *
 * Co jest w `/admin/users/[id]/PermissionsPanel.tsx` (NIE TYKAMY):
 *   - edycja profilu, role per aplikacja, reset hasła, sesje, 2FA,
 *     WebAuthn, integracje Google/Kadromierz, activity log, send actions.
 */

interface UsersClientProps {
  selfId?: string;
  userLabel?: string;
  userEmail?: string;
}

export function UsersClient({ selfId, userLabel, userEmail }: UsersClientProps) {
  // Data
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [first, setFirst] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [areas, setAreas] = useState<AreaSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // Side panels
  const [presence, setPresence] = useState<PresenceMap>({});
  const [integrations, setIntegrations] = useState<IntegrationsMap>({});
  const [locks, setLocks] = useState<LockMap>({});

  // Tab navigation between users list and groups management.
  const [activeTab, setActiveTab] = useState<"users" | "groups">("users");

  // Modal + bulk group selection
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkGroupOpen, setBulkGroupOpen] = useState(false);

  // Feedback
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Role options for filter dropdown (loaded once).
  useEffect(() => {
    permissionAreaService
      .list()
      .then((res) => setAreas(res.areas))
      .catch(() => setAreas([]));
  }, []);

  // ── Data fetching ───────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminUserService.list({
        search: search || undefined,
        first,
        max: PAGE_SIZE,
        role: roleFilter || undefined,
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
  }, [search, first, roleFilter]);

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

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((p) => toggleSelection(p, id));
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((p) => toggleAllSelection(p, users.map((u) => u.id)));
  }, [users]);

  const allSelected =
    users.length > 0 && users.every((u) => selectedIds.has(u.id));
  const someSelected = users.some((u) => selectedIds.has(u.id));

  const selectedUsers = useMemo(
    () => users.filter((u) => selectedIds.has(u.id)),
    [users, selectedIds],
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
      <OnboardingCard
        storageKey="admin-users"
        title="Zarządzanie userami i grupami"
        requiresArea="keycloak"
        requiresMinPriority={90}
      >
        Keycloak jest single-source-of-truth dla kont. Tutaj zapraszasz nowych,
        nadajesz role per aplikacja, zarządzasz członkostwem w grupach (które
        cascadeują role kompozytowo). Usunięcie usera tutaj propaguje się do
        Chatwoot/Documenso/Outline/Moodle/Directus.
      </OnboardingCard>

      <nav className="mb-4 flex border-b border-[var(--border-subtle)] gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "users"
              ? "border-[var(--accent)] text-[var(--text-main)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
          }`}
        >
          Użytkownicy
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("groups")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "groups"
              ? "border-[var(--accent)] text-[var(--text-main)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
          }`}
        >
          Grupy
        </button>
      </nav>

      {activeTab === "groups" && (
        <GroupsClient userLabel="" userEmail={undefined} embedded />
      )}

      {activeTab === "users" && (
        <>
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

          <UsersBulkBar
            selectedCount={selectedIds.size}
            onAssignGroup={() => setBulkGroupOpen(true)}
            onClear={() => setSelectedIds(new Set())}
          />

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

          <UsersFilters
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            roleFilter={roleFilter}
            onRoleChange={(r) => {
              setFirst(0);
              setRoleFilter(r);
            }}
            areas={areas}
            onSubmit={onSearchSubmit}
            onReset={() => {
              setSearch("");
              setSearchInput("");
              setRoleFilter("");
              setFirst(0);
            }}
            hasActiveFilters={Boolean(search || roleFilter)}
          />

          <UsersList
            users={users}
            loading={loading}
            selfId={selfId}
            pendingId={pendingId}
            selectedIds={selectedIds}
            presence={presence}
            integrations={integrations}
            locks={locks}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            allSelected={allSelected}
            someSelected={someSelected}
            total={total}
            first={first}
            onPrev={() => setFirst((f) => Math.max(0, f - PAGE_SIZE))}
            onNext={() => setFirst((f) => f + PAGE_SIZE)}
            onToggleEnabled={(u) => void toggleEnabled(u)}
            onDelete={(u) => void deleteUser(u)}
            onUnlock={(u) => void unlockUser(u)}
          />

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

          <BulkGroupDialog
            open={bulkGroupOpen}
            users={selectedUsers}
            onClose={() => setBulkGroupOpen(false)}
            onDone={(msg) => {
              setBulkGroupOpen(false);
              setSelectedIds(new Set());
              setNotice(msg);
            }}
          />
        </>
      )}
    </PageShell>
  );
}
