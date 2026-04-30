"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Shield, X } from "lucide-react";
import { Alert, Badge, Button, Dialog, FieldWrapper } from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import {
  adminGroupService,
  type AdminGroup,
  type AdminUserSummary,
} from "@/app/account/account-service";

/**
 * Sticky bar pokazywany gdy `selectedCount > 0`. Daje akcje bulk:
 *   - Przypisz grupę (otwiera BulkGroupDialog)
 *   - Odznacz wszystkich
 */
export function UsersBulkBar({
  selectedCount,
  onAssignGroup,
  onClear,
}: {
  selectedCount: number;
  onAssignGroup: () => void;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--accent)] bg-[var(--bg-surface)] shadow-md">
      <div className="text-sm text-[var(--text-main)]">
        Zaznaczono <strong>{selectedCount}</strong>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          leftIcon={<Shield className="w-4 h-4" aria-hidden="true" />}
          onClick={onAssignGroup}
        >
          Przypisz grupę
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="w-4 h-4" aria-hidden="true" />
          Odznacz
        </Button>
      </div>
    </div>
  );
}

// ── Bulk group assignment dialog ─────────────────────────────────────────

export function BulkGroupDialog({
  open,
  users,
  onClose,
  onDone,
}: {
  open: boolean;
  users: AdminUserSummary[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [groupId, setGroupId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setGroupId("");
    setError(null);
    void adminGroupService
      .list()
      .then((r) => setGroups(r.groups))
      .catch(() => setGroups([]));
  }, [open]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === groupId) ?? null,
    [groups, groupId],
  );

  const submit = useCallback(async () => {
    if (!groupId || users.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminGroupService.bulkAssign({
        userIds: users.map((u) => u.id),
        groupId,
        replace: true,
      });
      const groupName = selectedGroup?.name ?? "grupa";
      onDone(
        res.failed === 0
          ? `Przypisano ${res.ok} userów do "${groupName}"`
          : `Przypisano ${res.ok}/${res.total} (${res.failed} błędów) do "${groupName}"`,
      );
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Nie udało się przypisać",
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, users, selectedGroup, onDone]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Przypisz grupę zbiorczo"
      description={`${users.length} użytkowników → grupa Keycloak (nadpisuje istniejące przypisania)`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Anuluj
          </Button>
          <Button
            onClick={() => void submit()}
            loading={loading}
            disabled={!groupId}
            leftIcon={<Shield className="w-4 h-4" aria-hidden="true" />}
          >
            Zapisz
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="space-y-3">
        <FieldWrapper id="bulk-group" label="Grupa" required>
          <select
            id="bulk-group"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm"
          >
            <option value="">— wybierz —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.realmRoles.length > 0 ? ` (${g.realmRoles.length} ról)` : ""}
              </option>
            ))}
          </select>
        </FieldWrapper>
        {selectedGroup && (
          <div className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
              Role które user dziedziczy
            </p>
            <div className="flex flex-wrap gap-1">
              {selectedGroup.realmRoles.length === 0 ? (
                <span className="text-xs text-[var(--text-muted)]">brak</span>
              ) : (
                selectedGroup.realmRoles.map((r) => (
                  <Badge key={r} tone="neutral" className="text-[10px] font-mono">
                    {r}
                  </Badge>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
