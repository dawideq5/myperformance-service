export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import { ROLE_CATALOG, ROLES, requireAdminPanel } from "@/lib/admin-auth";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";

export interface RoleUser {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  enabled: boolean;
}

export interface RoleNode {
  name: string;
  description: string;
  default: boolean;
  users: RoleUser[];
}

export interface ServiceNode {
  id: string;
  label: string;
  description?: string;
  roles: RoleNode[];
}

/**
 * Logical grouping of realm roles for the permissions tree. Ordering is
 * ui-driven: most-used services first, admin consoles clustered at the
 * bottom. A role only appears in one node — anything not matched falls
 * into the "Inne" bucket at the end.
 */
const SERVICE_GROUPS: Array<{
  id: string;
  label: string;
  description?: string;
  roleNames: string[];
}> = [
  {
    id: "dashboard",
    label: "Dashboard (domyślny dostęp)",
    description: "Role przyznawane wszystkim uwierzytelnionym użytkownikom",
    roleNames: [ROLES.APP_USER, ROLES.KADROMIERZ_USER, ROLES.KNOWLEDGE_USER],
  },
  {
    id: "panels",
    label: "Panele mTLS (pracownicze)",
    description: "Cert-gated panele dla ról operacyjnych",
    roleNames: [
      "sprzedawca",
      "sprzedawca_admin",
      "serwisant",
      "serwisant_admin",
      "kierowca",
      "kierowca_admin",
    ],
  },
  {
    id: "documenso",
    label: "Dokumenty (Documenso)",
    description: "E-podpis: pracownik → obsługa (księgowa) → administrator",
    roleNames: [
      ROLES.DOCUMENSO_USER,
      ROLES.DOCUMENSO_HANDLER,
      ROLES.DOCUMENSO_ADMIN,
    ],
  },
  {
    id: "chatwoot",
    label: "Chatwoot",
    description: "Obsługa rozmów z klientami",
    roleNames: [ROLES.CHATWOOT_AGENT, ROLES.CHATWOOT_ADMIN],
  },
  {
    id: "moodle",
    label: "MyPerformance — Akademia (Moodle)",
    description: "LMS — szkolenia wewnętrzne",
    roleNames: [ROLES.MOODLE_STUDENT, ROLES.MOODLE_TEACHER, ROLES.MOODLE_ADMIN],
  },
  {
    id: "knowledge",
    label: "Baza wiedzy (Outline)",
    description: "Wewnętrzna wiki zespołu",
    roleNames: [ROLES.KNOWLEDGE_ADMIN],
  },
  {
    id: "postal",
    label: "Postal",
    roleNames: [ROLES.POSTAL_ADMIN],
  },
  {
    id: "directus",
    label: "Directus (CMS)",
    roleNames: [ROLES.DIRECTUS_ADMIN],
  },
  {
    id: "admin",
    label: "Administracja platformą",
    description: "Konsole i operacje o podwyższonym ryzyku",
    roleNames: [
      ROLES.MANAGE_USERS,
      ROLES.CERTIFICATES_ADMIN,
      ROLES.STEPCA_ADMIN,
      ROLES.KEYCLOAK_ADMIN,
    ],
  },
];

async function fetchUsersForRole(
  roleName: string,
  adminToken: string,
): Promise<RoleUser[]> {
  // Keycloak uses cached snapshots for role-user listings; 100 users is
  // enough for every role we have today.
  const res = await keycloak.adminRequest(
    `/roles/${encodeURIComponent(roleName)}/users?first=0&max=200`,
    adminToken,
  );
  if (!res.ok) return [];
  const raw = (await res.json()) as Array<{
    id: string;
    username?: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    enabled?: boolean;
  }>;
  return raw.map((u) => ({
    id: u.id,
    username: u.username ?? "",
    email: u.email ?? null,
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null,
    enabled: u.enabled !== false,
  }));
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const adminToken = await keycloak.getServiceAccountToken();
    const catalog = new Map<string, (typeof ROLE_CATALOG)[number]>(
      ROLE_CATALOG.map((r) => [r.name as string, r]),
    );
    const claimed = new Set<string>();

    const nodes: ServiceNode[] = await Promise.all(
      SERVICE_GROUPS.map(async (group) => {
        const roles: RoleNode[] = [];
        for (const rn of group.roleNames) {
          claimed.add(rn);
          const catalogEntry = catalog.get(rn);
          const users = await fetchUsersForRole(rn, adminToken);
          roles.push({
            name: rn,
            description: catalogEntry?.description ?? rn,
            default: catalogEntry?.default ?? false,
            users,
          });
        }
        return {
          id: group.id,
          label: group.label,
          description: group.description,
          roles,
        };
      }),
    );

    const leftovers = ROLE_CATALOG.filter((r) => !claimed.has(r.name));
    if (leftovers.length > 0) {
      const roles: RoleNode[] = [];
      for (const r of leftovers) {
        const users = await fetchUsersForRole(r.name, adminToken);
        roles.push({
          name: r.name,
          description: r.description,
          default: r.default,
          users,
        });
      }
      nodes.push({ id: "other", label: "Inne role", roles });
    }

    return createSuccessResponse({ services: nodes });
  } catch (error) {
    return handleApiError(error);
  }
}
