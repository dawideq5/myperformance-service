"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  Check,
  ExternalLink,
  Loader2,
  Trash2,
  Unlock,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import type {
  AdminIntegrationStatus,
  AdminUserSummary,
} from "@/app/account/account-service";
import {
  formatDate,
  fullName,
  isOnline,
  PAGE_SIZE,
  summarizeLock,
  type IntegrationsMap,
  type LockMap,
  type PresenceMap,
} from "@/lib/services/users-service";

/**
 * Tabela userów + paginacja. UserRow jest local-component (memo'd implicitly
 * przez React reconcilation; jeśli okazałby się hot-spot w profilach to
 * można nawinąć w React.memo).
 */
export function UsersList({
  users,
  loading,
  selfId,
  pendingId,
  selectedIds,
  presence,
  integrations,
  locks,
  onToggleSelect,
  onToggleAll,
  allSelected,
  someSelected,
  total,
  first,
  onPrev,
  onNext,
  onToggleEnabled,
  onDelete,
  onUnlock,
}: {
  users: AdminUserSummary[];
  loading: boolean;
  selfId?: string;
  pendingId: string | null;
  selectedIds: Set<string>;
  presence: PresenceMap;
  integrations: IntegrationsMap;
  locks: LockMap;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  someSelected: boolean;
  total: number;
  first: number;
  onPrev: () => void;
  onNext: () => void;
  onToggleEnabled: (u: AdminUserSummary) => void;
  onDelete: (u: AdminUserSummary) => void;
  onUnlock: (u: AdminUserSummary) => void;
}) {
  const start = total > 0 ? first + 1 : 0;
  const end = Math.min(first + PAGE_SIZE, total);
  const hasPrev = first > 0;
  const hasNext = first + PAGE_SIZE < total;

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border-subtle)]">
            <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <th className="px-3 py-3 font-medium w-[40px]">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={onToggleAll}
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
                  onToggleSelect={() => onToggleSelect(u.id)}
                  onToggleEnabled={() => onToggleEnabled(u)}
                  onDelete={() => onDelete(u)}
                  onUnlock={() => onUnlock(u)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
          <span>
            {start}–{end} z {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasPrev || loading}
              onClick={onPrev}
            >
              Poprzednia
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasNext || loading}
              onClick={onNext}
            >
              Następna
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Wiersz tabeli ─────────────────────────────────────────────────────────

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
  lock:
    | { numFailures: number; disabled: boolean; lastFailure: number | null }
    | undefined;
  onToggleSelect: () => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
  onUnlock: () => void;
}) {
  const online = isOnline(presence);
  const { locked, numFailures, disabledByLock } = summarizeLock(lock);

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
          {online && (
            <Badge
              tone="success"
              title={`Ostatnio: ${formatDate(presence ?? null)}`}
            >
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
              title={`${numFailures} nieudanych prób${
                disabledByLock ? " · zablokowany" : ""
              }`}
            >
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              {disabledByLock ? "Brute-force lock" : `${numFailures} błędów`}
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
