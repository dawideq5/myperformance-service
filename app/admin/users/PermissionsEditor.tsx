"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Clock,
  Database,
  FileSignature,
  GraduationCap,
  Key,
  LogIn,
  Mail,
  MessageSquare,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Alert, Badge, Button, Card } from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import {
  permissionAreaService,
  type AdminUserSummary,
  type AreaSummary,
} from "@/app/account/account-service";

import { AreaCard } from "./AreaCard";
import { BulkAssignDialog } from "./BulkAssignDialog";

/**
 * Jednolity edytor uprawnień.
 *
 * Prezentuje listę obszarów (AREAS) i dla każdego pozwala:
 *   - zobaczyć liczbę userów per rola,
 *   - otworzyć kartę z pełną listą ról + permissions (live fetch),
 *   - utworzyć/edytować/usunąć custom rolę (dla native area),
 *   - wywołać bulk assignment dla zaznaczonych userów z tabeli.
 */
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

interface PermissionsEditorProps {
  /** Users zaznaczeni w tabeli — źródło dla bulk assignmentu. */
  selectedUsers: AdminUserSummary[];
  onAfterBulk?: () => void;
}

export function PermissionsEditor({
  selectedUsers,
  onAfterBulk,
}: PermissionsEditorProps) {
  const [areas, setAreas] = useState<AreaSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bulkAreaId, setBulkAreaId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await permissionAreaService.list();
      setAreas(res.areas);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się pobrać listy obszarów",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalUsersAcrossAreas = useMemo(
    () => areas.reduce((sum, a) => sum + a.totalAssignedUsers, 0),
    [areas],
  );

  return (
    <Card padding="none" className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-main)]">
            Uprawnienia
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Obszary ({areas.length}) · suma przypisań ról: {totalUsersAcrossAreas}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            leftIcon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}
            loading={loading}
          >
            Odśwież
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed((c) => !c)}
            leftIcon={
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  collapsed ? "-rotate-90" : ""
                }`}
                aria-hidden="true"
              />
            }
          >
            {collapsed ? "Rozwiń" : "Zwiń"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-4 pt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {!collapsed && (
        <div className="divide-y divide-[var(--border-subtle)]">
          {areas.map((area) => {
            const Icon = ICON_MAP[area.icon ?? ""] ?? Shield;
            const isExpanded = expandedId === area.id;
            return (
              <div key={area.id}>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId((prev) => (prev === area.id ? null : area.id))
                  }
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-main)] transition-colors"
                >
                  <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--bg-main)] border border-[var(--border-subtle)] flex items-center justify-center">
                    <Icon className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-sm text-[var(--text-main)]">
                        {area.label}
                      </span>
                      <Badge tone={area.provider === "native" ? "info" : "neutral"}>
                        {area.provider === "native" ? "native" : "KC-only"}
                      </Badge>
                      {area.provider === "native" && !area.nativeConfigured && (
                        <Badge tone="warning">provider offline</Badge>
                      )}
                      {area.provider === "native" && !area.supportsCustomRoles && (
                        <Badge tone="neutral">role systemowe</Badge>
                      )}
                    </span>
                    <span className="block text-xs text-[var(--text-muted)] mt-0.5 truncate">
                      {area.description}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                    <span>
                      {area.seedRoles.length} rol / {area.totalAssignedUsers} użytk.
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </span>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 bg-[var(--bg-main)]/50">
                    <AreaCard
                      areaId={area.id}
                      canBulk={selectedUsers.length > 0}
                      onOpenBulk={() => setBulkAreaId(area.id)}
                      onAfterChange={() => void refresh()}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <BulkAssignDialog
        areaId={bulkAreaId}
        users={selectedUsers}
        onClose={() => setBulkAreaId(null)}
        onDone={() => {
          setBulkAreaId(null);
          onAfterBulk?.();
          void refresh();
        }}
      />
    </Card>
  );
}
