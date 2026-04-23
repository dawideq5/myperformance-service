"use client";

import { useCallback, useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";

import { Alert, Badge, Button, Card } from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import { permissionAreaService } from "@/app/account/account-service";

type SyncResult = Awaited<ReturnType<typeof permissionAreaService.syncKc>>;
type MigrateResult = Awaited<
  ReturnType<typeof permissionAreaService.migrateLegacyRoles>
>;

/**
 * Panel "Narzędzia IAM" w /admin/users — dwie akcje:
 *   - Synchronizuj role z Keycloak: tworzy brakujące realm roles +
 *     composite groups na bazie AREAS + dynamicznych ról providerów.
 *   - Migruj użytkowników ze starych ról: dla każdego usera w realmie
 *     zamienia legacy role (chatwoot_user, documenso_user, moodle_user…)
 *     na nową taksonomię i synchronizuje zmianę do natywnej aplikacji
 *     (Chatwoot, Moodle, Documenso, Outline…).
 *
 * Obie operacje są idempotentne — ponowne wywołanie robi minimum pracy.
 */
export function IamToolsPanel() {
  const [syncing, setSyncing] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [deleteLegacy, setDeleteLegacy] = useState(false);
  const [deleteStale, setDeleteStale] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [migrateResult, setMigrateResult] = useState<MigrateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await permissionAreaService.syncKc({ deleteStale });
      setSyncResult(res);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zsynchronizować ról z Keycloak",
      );
    } finally {
      setSyncing(false);
    }
  }, [deleteStale]);

  const runMigrate = useCallback(async () => {
    if (
      !window.confirm(
        `Masowo przenieść wszystkich użytkowników ze starych ról na nowy zestaw?\n\n` +
          `Operacja zamieni np. chatwoot_user→chatwoot_agent, documenso_user→documenso_member w KC ` +
          `i jednocześnie zsynchronizuje zmianę do aplikacji natywnych (Chatwoot, Documenso, Moodle, Outline).\n\n` +
          (deleteLegacy
            ? "Po migracji legacy role zostaną USUNIĘTE z realmu."
            : "Legacy role pozostaną w realmie (flag deleteLegacy wyłączony)."),
      )
    ) {
      return;
    }
    setMigrating(true);
    setError(null);
    try {
      const res = await permissionAreaService.migrateLegacyRoles({
        deleteLegacy,
      });
      setMigrateResult(res);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zmigrować użytkowników",
      );
    } finally {
      setMigrating(false);
    }
  }, [deleteLegacy]);

  return (
    <Card padding="md" className="mb-4">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-main)]">
            Narzędzia IAM
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Synchronizacja ról Keycloak + migracja istniejących userów z
            legacy taksonomii na nowy zestaw ról per aplikacja.
          </p>
        </div>
      </header>

      {error && (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* ─── Sync KC ────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
          <div className="flex items-start gap-2 mb-2">
            <RefreshCw
              className="w-4 h-4 text-[var(--accent)] mt-0.5"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-[var(--text-main)]">
                Synchronizuj role z Keycloak
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Tworzy brakujące realm roles (np. świeżo dodane role w
                Moodle) oraz composite groups app-&lt;areaId&gt;. Idempotentne.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-2">
            <input
              type="checkbox"
              checked={deleteStale}
              onChange={(e) => setDeleteStale(e.target.checked)}
              className="rounded border-[var(--border-subtle)]"
            />
            Usuń role nienależące już do AREAS (stale)
          </label>
          <Button
            size="sm"
            variant="secondary"
            loading={syncing}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
            onClick={() => void runSync()}
          >
            Uruchom sync
          </Button>

          {syncResult && (
            <div className="mt-2 text-xs text-[var(--text-muted)] space-y-0.5">
              <div>
                Utworzone: <strong>{syncResult.rolesCreated}</strong>,
                zaktualizowane: <strong>{syncResult.rolesUpdated}</strong>,
                usunięte: <strong>{syncResult.rolesDeleted}</strong>
              </div>
              <div>
                Grupy: utworzone <strong>{syncResult.groupsCreated}</strong>,
                zaktualizowane <strong>{syncResult.groupsUpdated}</strong>
              </div>
              {syncResult.errors.length > 0 && (
                <div className="text-red-400">
                  Błędy: {syncResult.errors.length} — sprawdź audit log.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Migracja ───────────────────────────────────────────────── */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
          <div className="flex items-start gap-2 mb-2">
            <ArrowRightLeft
              className="w-4 h-4 text-[var(--accent)] mt-0.5"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-[var(--text-main)]">
                Migruj użytkowników ze starych ról
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                chatwoot_user → chatwoot_agent, documenso_user → member,
                knowledge_user → editor, moodle_user → student, itd. Plus
                sync do natywnych aplikacji.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-2">
            <input
              type="checkbox"
              checked={deleteLegacy}
              onChange={(e) => setDeleteLegacy(e.target.checked)}
              className="rounded border-[var(--border-subtle)]"
            />
            Po migracji usuń legacy role z realmu
          </label>
          <Button
            size="sm"
            variant="secondary"
            loading={migrating}
            leftIcon={
              <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
            }
            onClick={() => void runMigrate()}
          >
            Uruchom migrację
          </Button>

          {migrateResult && (
            <div className="mt-2 text-xs text-[var(--text-muted)] space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success">
                  Zmigrowano: {migrateResult.migratedUsers} / {migrateResult.totalUsers}
                </Badge>
                {migrateResult.errors.length > 0 && (
                  <Badge tone="danger">
                    Błędy: {migrateResult.errors.length}
                  </Badge>
                )}
                {migrateResult.deletedLegacyRoles.length > 0 && (
                  <Badge tone="info">
                    Usunięte role: {migrateResult.deletedLegacyRoles.length}
                  </Badge>
                )}
              </div>
              {migrateResult.results.filter((r) => r.migrated.length > 0)
                .length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[var(--accent)] hover:underline">
                    Pokaż szczegóły ({migrateResult.results.filter((r) => r.migrated.length > 0).length} userów)
                  </summary>
                  <ul className="mt-1 max-h-48 overflow-y-auto space-y-1">
                    {migrateResult.results
                      .filter((r) => r.migrated.length > 0)
                      .map((r) => (
                        <li key={r.userId} className="text-[11px]">
                          <span className="font-medium text-[var(--text-main)]">
                            {r.email ?? r.username}
                          </span>
                          <ul className="ml-3">
                            {r.migrated.map((m, i) => (
                              <li key={i} className="flex items-center gap-1">
                                {m.status === "ok" ? (
                                  <CheckCircle2
                                    className="w-3 h-3 text-emerald-500"
                                    aria-hidden="true"
                                  />
                                ) : m.status === "failed" ? (
                                  <XCircle
                                    className="w-3 h-3 text-red-500"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Loader2
                                    className="w-3 h-3 text-[var(--text-muted)]"
                                    aria-hidden="true"
                                  />
                                )}
                                <code>
                                  {m.from} → {m.to ?? "—"}
                                </code>
                                {m.error && (
                                  <span className="text-red-400 ml-1">
                                    {m.error}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
