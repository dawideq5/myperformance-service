"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  Clock,
  Database,
  ExternalLink,
  FileSignature,
  GraduationCap,
  Key,
  Loader2,
  LogIn,
  Mail,
  MessageSquare,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Alert, Badge, Card } from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import {
  permissionAreaService,
  type AreaSummary,
} from "@/app/account/account-service";

/**
 * Wspólny komponent listy ról usera per aplikacja.
 *
 * Stan (`value`) trzymany przez rodzica — mapa `areaId → roleName | null`.
 * Komponent wyłącznie renderuje listę i dispatchuje `onChange`. Zapis
 * (propagacja do KC + providerów) odbywa się w konkretnym widoku (invite,
 * bulk, detail), który wywołuje odpowiednie API po zebraniu formularza.
 *
 * W trybie `autoSave=true` komponent sam wywołuje `onPersist(areaId, roleName)`
 * przy każdej zmianie (używane w user detail, gdzie zmiana jest od razu
 * zapisywana). W trybie `autoSave=false` komponent jest stateless-form
 * (używane w invite/bulk, gdzie zapis idzie całym payloadem na koniec).
 */

const ICON_MAP: Record<string, LucideIcon> = {
  MessageSquare,
  GraduationCap,
  Database,
  FileSignature,
  BookOpen,
  Mail,
  Shield,
  ShieldCheck,
  Key,
  Clock,
  ShoppingCart,
  Wrench,
  Truck,
  LogIn,
};

export interface UserRolesListValue {
  [areaId: string]: string | null;
}

interface Props {
  value: UserRolesListValue;
  onChange: (next: UserRolesListValue) => void;
  disabled?: boolean;
  /**
   * Callback wywoływany po zmianie roli. Zwraca Promise żeby komponent
   * mógł pokazać spinner do zakończenia zapisu. Gdy rzuci — UI cofa
   * zmianę.
   */
  onPersist?: (
    areaId: string,
    roleName: string | null,
  ) => Promise<void>;
  /** Pokazuje link "Zarządzaj w natywnym UI aplikacji". */
  showNativeAdminUrl?: boolean;
  /** Filtr listy obszarów (np. tylko apki widoczne dla invite). */
  areaFilter?: (area: AreaSummary) => boolean;
}

export function UserRolesList({
  value,
  onChange,
  disabled = false,
  onPersist,
  showNativeAdminUrl = false,
  areaFilter,
}: Props) {
  const [areas, setAreas] = useState<AreaSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [rowError, setRowError] = useState<Record<string, string | null>>({});
  // areaId → timestamp when last save succeeded (used to show a transient
  // ✓ check next to the dropdown for 2s after a user's edit).
  const [justSavedAt, setJustSavedAt] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0); // re-render for auto-hide

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    permissionAreaService
      .list()
      .then((res) => {
        if (cancelled) return;
        setAreas(res.areas);
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się pobrać listy aplikacji",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!areas) return null;
    return areaFilter ? areas.filter(areaFilter) : areas;
  }, [areas, areaFilter]);

  const setRole = useCallback(
    async (areaId: string, roleName: string | null) => {
      const prev = value[areaId] ?? null;
      onChange({ ...value, [areaId]: roleName });
      setRowError((r) => ({ ...r, [areaId]: null }));
      if (!onPersist) return;
      setPending((p) => new Set(p).add(areaId));
      try {
        await onPersist(areaId, roleName);
        setJustSavedAt((m) => ({ ...m, [areaId]: Date.now() }));
      } catch (err) {
        // Cofamy optymistyczną zmianę.
        onChange({ ...value, [areaId]: prev });
        setRowError((r) => ({
          ...r,
          [areaId]:
            err instanceof ApiRequestError
              ? err.message
              : "Nie udało się zapisać",
        }));
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(areaId);
          return next;
        });
      }
    },
    [value, onChange, onPersist],
  );

  // Auto-hide saved markers after 2s. Ticks the clock every 500ms while
  // there is at least one fresh save in `justSavedAt`.
  useEffect(() => {
    if (Object.keys(justSavedAt).length === 0) return;
    const now = Date.now();
    const stale = Object.entries(justSavedAt).filter(
      ([, t]) => now - t >= 2000,
    );
    if (stale.length === Object.keys(justSavedAt).length) {
      setJustSavedAt({});
      return;
    }
    const t = setTimeout(() => setTick((n) => n + 1), 500);
    return () => clearTimeout(t);
  }, [justSavedAt, tick]);

  if (loading) {
    return (
      <Card padding="md">
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Ładowanie listy aplikacji…
        </div>
      </Card>
    );
  }

  if (fetchError) {
    return <Alert tone="error">{fetchError}</Alert>;
  }

  if (!filtered || filtered.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Brak aplikacji do wyświetlenia.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-surface)]">
      {filtered.map((a) => {
        const Icon = ICON_MAP[a.icon ?? ""] ?? Shield;
        const current = value[a.id] ?? null;
        const isPending = pending.has(a.id);
        const rowErr = rowError[a.id];
        const offline = a.provider === "native" && !a.nativeConfigured;
        const savedAt = justSavedAt[a.id];
        const showSavedCheck =
          !!savedAt && !isPending && !rowErr && Date.now() - savedAt < 2000;

        return (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-3 px-4 py-3"
          >
            <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-[var(--bg-main)] border border-[var(--border-subtle)] flex items-center justify-center">
              <Icon
                className="w-4 h-4 text-[var(--accent)]"
                aria-hidden="true"
              />
            </span>

            <div className="flex-1 min-w-[180px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm text-[var(--text-main)]">
                  {a.label}
                </span>
                {offline && (
                  <Badge
                    tone="warning"
                    title={
                      a.missingEnv && a.missingEnv.length > 0
                        ? `Provider niedostępny. Brakujące zmienne środowiskowe: ${a.missingEnv.join(", ")}. Rola zostanie przypisana tylko w Keycloak.`
                        : "Provider niedostępny — rola zostanie przypisana tylko w Keycloak."
                    }
                  >
                    <AlertTriangle
                      className="w-3 h-3 mr-0.5"
                      aria-hidden="true"
                    />
                    offline
                    {a.missingEnv && a.missingEnv.length > 0 && (
                      <span className="ml-1 opacity-80">
                        ({a.missingEnv.length} env)
                      </span>
                    )}
                  </Badge>
                )}
                {a.dynamicRoles && (
                  <Badge tone="neutral" title="Role pobierane z natywnej aplikacji">
                    dynamiczne role
                  </Badge>
                )}
              </div>
              {a.description && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {a.description}
                </p>
              )}
              {rowErr && (
                <p className="text-xs text-red-400 mt-1">{rowErr}</p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <select
                value={current ?? ""}
                onChange={(e) =>
                  void setRole(
                    a.id,
                    e.target.value === "" ? null : e.target.value,
                  )
                }
                disabled={disabled || isPending}
                aria-label={`Rola w ${a.label}`}
                className="w-[260px] px-3 py-1.5 rounded-md bg-[var(--bg-main)] border border-[var(--border-subtle)] text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                <option value="">— brak dostępu —</option>
                {a.roles.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.label}
                  </option>
                ))}
              </select>

              {/* Stałej szerokości kolumna statusu — zapobiega "skakaniu"
                  selectów obok siebie gdy pojawi się ikona. */}
              <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                {isPending ? (
                  <Loader2
                    className="w-4 h-4 animate-spin text-[var(--text-muted)]"
                    aria-hidden="true"
                  />
                ) : showSavedCheck ? (
                  <Check
                    className="w-4 h-4 text-emerald-500"
                    aria-hidden="true"
                  />
                ) : null}
              </span>

              {showNativeAdminUrl && a.nativeAdminUrl && (
                <a
                  href={a.nativeAdminUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                  title={`Otwórz natywną konsolę: ${a.label}`}
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
