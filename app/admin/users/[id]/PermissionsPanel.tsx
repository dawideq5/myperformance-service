"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  Clock,
  Database,
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
  adminUserService,
  permissionAreaService,
  type AreaSummary,
} from "@/app/account/account-service";

const DEFAULT_AREA_IDS = new Set(["core", "kadromierz", "knowledge"]);

const ICON_MAP: Record<string, LucideIcon> = {
  MessageSquare,
  GraduationCap,
  Database,
  FileSignature,
  BookOpen,
  Mail,
  Shield,
  Key,
  Clock,
  ShoppingCart,
  Wrench,
  Truck,
  ShieldCheck,
  LogIn,
};

interface PermissionsPanelProps {
  userId: string;
  onChanged?: () => void;
}

type AreaState = Record<string, { current: string | null; saving: boolean; error?: string }>;

export function PermissionsPanel({ userId, onChanged }: PermissionsPanelProps) {
  const [areas, setAreas] = useState<AreaSummary[]>([]);
  const [state, setState] = useState<AreaState>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, assignRes] = await Promise.all([
        permissionAreaService.list(),
        adminUserService.listAreaAssignments(userId),
      ]);
      setAreas(listRes.areas);
      const st: AreaState = {};
      for (const a of listRes.areas) st[a.id] = { current: null, saving: false };
      for (const a of assignRes.assignments) {
        if (st[a.areaId]) st[a.areaId].current = a.roleName;
      }
      setState(st);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się pobrać uprawnień",
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setAreaRole = useCallback(
    async (areaId: string, roleName: string | null) => {
      setState((prev) => ({
        ...prev,
        [areaId]: { ...prev[areaId], saving: true, error: undefined },
      }));
      try {
        await adminUserService.setAreaRole(userId, { areaId, roleName });
        setState((prev) => ({
          ...prev,
          [areaId]: { current: roleName, saving: false },
        }));
        onChanged?.();
      } catch (err) {
        setState((prev) => ({
          ...prev,
          [areaId]: {
            ...prev[areaId],
            saving: false,
            error:
              err instanceof ApiRequestError
                ? err.message
                : "Zapis nieudany",
          },
        }));
      }
    },
    [userId, onChanged],
  );

  const defaultAreas = useMemo(
    () => areas.filter((a) => DEFAULT_AREA_IDS.has(a.id)),
    [areas],
  );
  const appAreas = useMemo(
    () => areas.filter((a) => !DEFAULT_AREA_IDS.has(a.id)),
    [areas],
  );

  if (loading) {
    return (
      <Card padding="md">
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Ładowanie obszarów uprawnień…
        </div>
      </Card>
    );
  }
  if (error) {
    return <Alert tone="error">{error}</Alert>;
  }

  const renderArea = (a: AreaSummary) => {
        const Icon = ICON_MAP[a.icon ?? ""] ?? Shield;
        const st = state[a.id] ?? { current: null, saving: false };
        const offline = a.provider === "native" && !a.nativeConfigured;
        return (
          <Card key={a.id} padding="md" className="flex flex-col">
            <header className="flex items-start gap-3 mb-3">
              <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-[var(--bg-main)] border border-[var(--border-subtle)] flex items-center justify-center">
                <Icon className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-sm text-[var(--text-main)]">
                    {a.label}
                  </h3>
                  <Badge tone={a.provider === "native" ? "info" : "neutral"}>
                    {a.provider === "native" ? "native" : "KC-only"}
                  </Badge>
                  {offline && (
                    <Badge tone="warning">
                      <AlertTriangle
                        className="w-3 h-3 mr-0.5"
                        aria-hidden="true"
                      />
                      provider offline
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {a.description}
                </p>
              </div>
              {st.saving && (
                <Loader2
                  className="w-4 h-4 animate-spin text-[var(--text-muted)] flex-shrink-0"
                  aria-hidden="true"
                />
              )}
              {!st.saving && !st.error && st.current !== null && (
                <Check
                  className="w-4 h-4 text-emerald-500 flex-shrink-0"
                  aria-hidden="true"
                />
              )}
            </header>

            {st.error && (
              <div className="mb-2">
                <Alert tone="error">{st.error}</Alert>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="flex items-start gap-2 text-sm cursor-pointer group">
                <input
                  type="radio"
                  name={`area-${a.id}`}
                  checked={st.current === null}
                  onChange={() => void setAreaRole(a.id, null)}
                  disabled={st.saving}
                  className="mt-1 cursor-pointer"
                />
                <span className="flex-1 text-[var(--text-muted)] group-hover:text-[var(--text-main)]">
                  <span className="font-medium">— brak roli —</span>
                  <span className="block text-xs text-[var(--text-muted)] mt-0.5">
                    User nie ma dostępu do tej aplikacji.
                  </span>
                </span>
              </label>
              {a.seedRoles.map((r) => (
                <label
                  key={r.name}
                  className="flex items-start gap-2 text-sm cursor-pointer group"
                >
                  <input
                    type="radio"
                    name={`area-${a.id}`}
                    checked={st.current === r.name}
                    onChange={() => void setAreaRole(a.id, r.name)}
                    disabled={st.saving}
                    className="mt-1 cursor-pointer"
                  />
                  <span className="flex-1">
                    <span className="font-medium text-[var(--text-main)] group-hover:text-[var(--accent)]">
                      {r.name}
                    </span>
                    {r.description && (
                      <span className="block text-xs text-[var(--text-muted)] mt-0.5">
                        {r.description}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </Card>
        );
  };

  return (
    <div className="space-y-6">
      {defaultAreas.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <LogIn className="w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-[var(--text-main)]">
              Podstawowe uprawnienia
            </h3>
            <Badge tone="neutral">auto-przypisane przy logowaniu</Badge>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Role domyślne — każdy użytkownik po aktywacji konta otrzymuje je
            automatycznie. Można je nadpisać indywidualnie.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {defaultAreas.map(renderArea)}
          </div>
        </section>
      )}

      {appAreas.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-[var(--text-main)]">
              Uprawnienia w aplikacjach
            </h3>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Wybierz rolę startową w każdej aplikacji. Zmiany są synchronizowane
            natychmiast do Keycloaka i natywnego systemu (gdy provider dostępny).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {appAreas.map(renderArea)}
          </div>
        </section>
      )}
    </div>
  );
}
