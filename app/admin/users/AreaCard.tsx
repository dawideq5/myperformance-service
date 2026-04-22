"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";

import { Alert, Badge, Button } from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import {
  permissionAreaService,
  type AreaDetail,
  type AreaDetailRole,
} from "@/app/account/account-service";

import { RoleEditor } from "./RoleEditor";

interface AreaCardProps {
  areaId: string;
  canBulk: boolean;
  onOpenBulk: () => void;
  onAfterChange?: () => void;
}

export function AreaCard({ areaId, canBulk, onOpenBulk, onAfterChange }: AreaCardProps) {
  const [detail, setDetail] = useState<AreaDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<AreaDetailRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await permissionAreaService.detail(areaId);
      setDetail(res);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się pobrać szczegółów obszaru",
      );
    } finally {
      setLoading(false);
    }
  }, [areaId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const deleteRole = useCallback(
    async (kcRoleName: string) => {
      if (!window.confirm(`Usunąć rolę ${kcRoleName}? Operacja jest nieodwracalna.`)) return;
      setPendingDelete(kcRoleName);
      setError(null);
      try {
        await permissionAreaService.deleteRole(areaId, kcRoleName);
        await refresh();
        onAfterChange?.();
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się usunąć roli",
        );
      } finally {
        setPendingDelete(null);
      }
    },
    [areaId, refresh, onAfterChange],
  );

  if (loading && !detail) {
    return (
      <p className="text-sm text-[var(--text-muted)] py-4">Ładowanie…</p>
    );
  }
  if (!detail) {
    return error ? <Alert tone="error">{error}</Alert> : null;
  }

  const { area, roles, orphanNativeRoles, nativePermissions } = detail;

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        {area.provider === "native" && area.supportsCustomRoles && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}
            onClick={() => setCreating(true)}
            disabled={!area.nativeConfigured}
            title={
              area.nativeConfigured
                ? undefined
                : "Provider natywny nie jest skonfigurowany (env)"
            }
          >
            Nowa rola
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Users className="w-4 h-4" aria-hidden="true" />}
          onClick={onOpenBulk}
          disabled={!canBulk}
          title={canBulk ? undefined : "Zaznacz użytkowników w tabeli"}
        >
          Bulk: przypisz rolę
        </Button>
      </div>

      <ul className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-surface)]">
        {roles.length === 0 && (
          <li className="px-3 py-3 text-sm text-[var(--text-muted)]">
            Brak ról seedowanych dla tego obszaru.
          </li>
        )}
        {roles.map((r) => (
          <li key={r.kcRoleName} className="px-3 py-2.5 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-[var(--text-main)]">
                  {r.kcRoleName}
                </span>
                {r.isSeeded && <Badge tone="neutral">seed</Badge>}
                {r.isCustom && <Badge tone="info">custom</Badge>}
                {r.native?.systemDefined && <Badge tone="warning">system</Badge>}
                <span className="text-xs text-[var(--text-muted)]">
                  {r.userCount} użytk.
                </span>
              </div>
              {r.description && (
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {r.description}
                </p>
              )}
              {r.native && (
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Natywne: <span className="text-[var(--text-main)]">{r.native.name}</span>
                  {r.native.permissions.length > 0 && (
                    <> · {r.native.permissions.length} uprawnień</>
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-shrink-0 gap-1">
              {area.provider === "native" && (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Edytuj rolę natywną"
                  disabled={
                    !area.nativeConfigured ||
                    r.native?.systemDefined ||
                    !r.native
                  }
                  onClick={() => setEditingRole(r)}
                >
                  <Pencil className="w-4 h-4" aria-hidden="true" />
                </Button>
              )}
              {r.isCustom && (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Usuń rolę custom"
                  className="text-red-500 hover:text-red-600"
                  loading={pendingDelete === r.kcRoleName}
                  disabled={!!pendingDelete}
                  onClick={() => void deleteRole(r.kcRoleName)}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {orphanNativeRoles.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
            Role natywne bez KC odpowiednika
          </p>
          <ul className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-surface)]">
            {orphanNativeRoles.map((r) => (
              <li key={r.id} className="px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-main)]">{r.name}</span>
                  {r.systemDefined && <Badge tone="warning">system</Badge>}
                </div>
                {r.description && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {r.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <RoleEditor
        areaId={areaId}
        mode={creating ? "create" : editingRole ? "edit" : null}
        initial={editingRole}
        permissions={nativePermissions}
        onClose={() => {
          setCreating(false);
          setEditingRole(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditingRole(null);
          void refresh();
          onAfterChange?.();
        }}
      />
    </div>
  );
}
