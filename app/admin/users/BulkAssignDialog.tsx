"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Users, XCircle } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Dialog,
  FieldWrapper,
} from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import {
  permissionAreaService,
  type AdminUserSummary,
  type AreaDetail,
  type AreaSummary,
  type AreaRole,
} from "@/app/account/account-service";

interface BulkAssignDialogProps {
  open: boolean;
  users: AdminUserSummary[];
  onClose: () => void;
  onDone: () => void;
}

type ResultEntry =
  | {
      userId: string;
      status: "ok";
      areaId: string;
      removed: string[];
      added: string[];
      nativeSync: "ok" | "skipped" | "failed";
      nativeError?: string;
    }
  | { userId: string; status: "failed"; error: string };

export function BulkAssignDialog({
  open,
  users,
  onClose,
  onDone,
}: BulkAssignDialogProps) {
  const [areas, setAreas] = useState<AreaSummary[] | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string>("");
  const [detail, setDetail] = useState<AreaDetail | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultEntry[] | null>(null);

  useEffect(() => {
    if (!open) {
      setAreas(null);
      setSelectedAreaId("");
      setDetail(null);
      setSelectedRole("");
      setError(null);
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    permissionAreaService
      .list()
      .then((res) => {
        if (cancelled) return;
        setAreas(res.areas);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się pobrać listy obszarów",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!selectedAreaId) {
      setDetail(null);
      setSelectedRole("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedRole("");
    permissionAreaService
      .detail(selectedAreaId)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się pobrać obszaru",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAreaId]);

  const userMap = useMemo(() => {
    const m = new Map<string, AdminUserSummary>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const availableRoles: AreaRole[] = useMemo(
    () => detail?.roles ?? [],
    [detail],
  );

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedAreaId || users.length === 0) return;
      setSubmitting(true);
      setError(null);
      setResults(null);
      try {
        const res = await permissionAreaService.bulkAssign({
          userIds: users.map((u) => u.id),
          areaId: selectedAreaId,
          roleName: selectedRole === "" ? null : selectedRole,
        });
        setResults(res.results);
        if (res.failed === 0) {
          onDone();
        }
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się wykonać operacji",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [selectedAreaId, users, selectedRole, onDone],
  );

  const okCount = results?.filter((r) => r.status === "ok").length ?? 0;
  const failCount = results?.filter((r) => r.status === "failed").length ?? 0;

  return (
    <Dialog
      open={open}
      onClose={submitting ? () => {} : onClose}
      size="lg"
      title="Masowe przypisanie roli"
      description={
        results
          ? "Wynik operacji"
          : `${users.length} zaznaczonych użytkowników — wybierz aplikację i rolę do przypisania.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {results ? "Zamknij" : "Anuluj"}
          </Button>
          {!results && (
            <Button
              type="submit"
              form="bulk-assign-form"
              loading={submitting}
              leftIcon={<Users className="w-4 h-4" aria-hidden="true" />}
              disabled={!detail || users.length === 0 || loading}
            >
              Zastosuj ({users.length})
            </Button>
          )}
        </>
      }
    >
      {error && !results && <Alert tone="error">{error}</Alert>}

      {results ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">OK: {okCount}</Badge>
            {failCount > 0 && <Badge tone="danger">Błędy: {failCount}</Badge>}
          </div>
          <ul className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-lg max-h-[50vh] overflow-y-auto bg-[var(--bg-surface)]">
            {results.map((r) => {
              const u = userMap.get(r.userId);
              const label = u?.email || u?.username || u?.id || r.userId;
              return (
                <li
                  key={r.userId}
                  className="px-3 py-2 flex items-start gap-3 text-sm"
                >
                  {r.status === "ok" ? (
                    <CheckCircle2
                      className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <XCircle
                      className="w-4 h-4 mt-0.5 text-red-500 flex-shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[var(--text-main)] truncate">
                      {label}
                    </div>
                    {r.status === "ok" ? (
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">
                        {r.added.length > 0 && <>dodano: {r.added.join(", ")} </>}
                        {r.removed.length > 0 && (
                          <>· usunięto: {r.removed.join(", ")} </>
                        )}
                        {r.added.length === 0 && r.removed.length === 0 && (
                          <>bez zmian</>
                        )}
                        {r.nativeSync === "failed" && (
                          <span className="text-amber-500 ml-1">
                            · sync natywny failed
                            {r.nativeError ? `: ${r.nativeError}` : ""}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-red-400 mt-0.5">
                        {r.error}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <form id="bulk-assign-form" onSubmit={submit} className="space-y-4">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-main)] px-3 py-2">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              Użytkownicy ({users.length})
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {users.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-main)]"
                >
                  {u.email || u.username}
                </span>
              ))}
            </div>
          </div>

          <FieldWrapper id="bulk-area" label="Aplikacja / obszar">
            <select
              id="bulk-area"
              value={selectedAreaId}
              onChange={(e) => setSelectedAreaId(e.target.value)}
              disabled={submitting || !areas}
              className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <option value="">— wybierz aplikację —</option>
              {areas?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                  {a.provider === "native" && !a.nativeConfigured
                    ? " (provider offline)"
                    : ""}
                </option>
              ))}
            </select>
          </FieldWrapper>

          <FieldWrapper
            id="bulk-role"
            label="Rola do przypisania"
            hint={
              detail?.area.provider === "native"
                ? "Rola zostanie zsynchronizowana z natywnym systemem aplikacji."
                : "Rola wyłącznie w Keycloak."
            }
          >
            <select
              id="bulk-role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              disabled={submitting || !detail || loading}
              className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <option value="">
                — brak roli (usuń wszystkie w obszarze) —
              </option>
              {availableRoles.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.label}
                </option>
              ))}
            </select>
          </FieldWrapper>

          {detail && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-main)] px-3 py-2 text-xs text-[var(--text-muted)]">
              <p className="font-medium text-[var(--text-main)] mb-1">
                Efekt operacji
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>
                  Każdy z {users.length} użytkowników otrzyma dokładnie jedną
                  rolę w obszarze <strong>{detail.area.label}</strong>.
                </li>
                <li>
                  Istniejące inne role tego obszaru zostaną usunięte
                  (single-role per area).
                </li>
                {detail.area.provider === "native" &&
                  detail.area.nativeConfigured && (
                    <li>
                      Rola zostanie też zsynchronizowana z natywnym systemem
                      aplikacji.
                    </li>
                  )}
              </ul>
            </div>
          )}

          {loading && (
            <p className="text-sm text-[var(--text-muted)] py-2 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Ładowanie…
            </p>
          )}
        </form>
      )}
    </Dialog>
  );
}
