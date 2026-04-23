"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Alert, Card } from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import { adminUserService } from "@/app/account/account-service";
import {
  UserRolesList,
  type UserRolesListValue,
} from "@/components/UserRolesList";

interface PermissionsPanelProps {
  userId: string;
  onChanged?: () => void;
}

export function PermissionsPanel({ userId, onChanged }: PermissionsPanelProps) {
  const [value, setValue] = useState<UserRolesListValue>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminUserService
      .listAreaAssignments(userId)
      .then((res) => {
        if (cancelled) return;
        const map: UserRolesListValue = {};
        for (const a of res.assignments) map[a.areaId] = a.roleName;
        setValue(map);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się pobrać uprawnień",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback(
    async (areaId: string, roleName: string | null) => {
      await adminUserService.setAreaRole(userId, { areaId, roleName });
      onChanged?.();
    },
    [userId, onChanged],
  );

  if (loading) {
    return (
      <Card padding="md">
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Ładowanie uprawnień…
        </div>
      </Card>
    );
  }

  if (error) {
    return <Alert tone="error">{error}</Alert>;
  }

  return (
    <UserRolesList
      value={value}
      onChange={setValue}
      onPersist={persist}
      showNativeAdminUrl
    />
  );
}
