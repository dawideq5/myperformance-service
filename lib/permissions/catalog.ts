import { kcRoleNameForDynamicRole, type PermissionArea } from "./areas";
import { getProvider } from "./registry";

/**
 * Ujednolicona lista ról per area: seedy z `areas.ts` + role wykryte
 * dynamicznie przez `provider.listRoles()` dla area z `dynamicRoles=true`.
 *
 * Używane przez `/api/admin/areas` + `/api/admin/areas/[id]`. Nie
 * mutuje KC — samo tylko zbiera listę do UI (enroll do KC robi
 * kc-sync).
 */
export interface MergedRole {
  name: string;
  label: string;
  description: string;
  priority: number;
  nativeRoleId: string | null;
  seed: boolean;
}

export async function resolveRoleCatalog(
  area: PermissionArea,
): Promise<MergedRole[]> {
  const out: MergedRole[] = area.kcRoles.map((s) => ({
    name: s.name,
    label: s.label,
    description: s.description,
    priority: s.priority,
    nativeRoleId: s.nativeRoleId ?? null,
    seed: true,
  }));

  if (area.dynamicRoles && area.provider === "native") {
    const provider = getProvider(area.nativeProviderId);
    if (provider && provider.isConfigured()) {
      try {
        const native = await provider.listRoles();
        for (const nr of native) {
          const kcName = kcRoleNameForDynamicRole(area, nr.id);
          if (out.some((r) => r.name === kcName)) continue;
          out.push({
            name: kcName,
            label: nr.name,
            description: nr.description ?? nr.name,
            priority: 20,
            nativeRoleId: nr.id,
            seed: false,
          });
        }
      } catch {
        // Provider unreachable — fallback na seedy. UI zasygnalizuje offline.
      }
    }
  }

  out.sort(
    (a, b) => b.priority - a.priority || a.label.localeCompare(b.label, "pl"),
  );

  return out;
}
