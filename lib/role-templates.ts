import { keycloak } from "@/lib/keycloak";
import { getArea } from "@/lib/permissions/areas";

/**
 * Role templates — named bundles of per-area role assignments. Stored as
 * JSON in the realm attribute `mp.role_templates` (one attribute, one
 * JSON array — Keycloak wraps attr values in string[] so we stringify).
 *
 * Invariant: each template enforces single-role-per-area via the
 * standard assignUserAreaRole flow — no composites, no back-doors.
 */

export interface RoleTemplateAssignment {
  areaId: string;
  roleName: string | null;
}

export interface RoleTemplate {
  id: string;
  name: string;
  description: string;
  icon?: string | null;
  areaRoles: RoleTemplateAssignment[];
  createdAt: string;
  updatedAt: string;
}

const REALM_ATTR_KEY = "mp.role_templates";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function sanitizeAssignments(
  raw: unknown,
): RoleTemplateAssignment[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RoleTemplateAssignment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const areaId = String(rec.areaId ?? "").trim();
    if (!areaId || seen.has(areaId)) continue;
    if (!getArea(areaId)) continue;
    const roleNameRaw = rec.roleName;
    const roleName =
      roleNameRaw === null || roleNameRaw === undefined || roleNameRaw === ""
        ? null
        : String(roleNameRaw);
    seen.add(areaId);
    out.push({ areaId, roleName });
  }
  return out;
}

async function fetchRealm(adminToken: string) {
  const res = await keycloak.adminRequest("", adminToken);
  if (!res.ok) {
    throw new Error(`fetch realm failed: ${res.status}`);
  }
  return (await res.json()) as { attributes?: Record<string, string> };
}

async function saveTemplates(
  adminToken: string,
  templates: RoleTemplate[],
): Promise<void> {
  const realm = await fetchRealm(adminToken);
  const nextAttrs: Record<string, string> = {
    ...(realm.attributes ?? {}),
    [REALM_ATTR_KEY]: JSON.stringify(templates),
  };
  const res = await keycloak.adminRequest("", adminToken, {
    method: "PUT",
    body: JSON.stringify({ ...realm, attributes: nextAttrs }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `save templates failed: ${res.status} ${body.slice(0, 200)}`,
    );
  }
}

export async function listTemplates(
  adminToken: string,
): Promise<RoleTemplate[]> {
  const realm = await fetchRealm(adminToken);
  const raw = realm.attributes?.[REALM_ATTR_KEY];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t: unknown): t is RoleTemplate =>
        !!t &&
        typeof t === "object" &&
        typeof (t as Record<string, unknown>).id === "string" &&
        typeof (t as Record<string, unknown>).name === "string",
    );
  } catch {
    return [];
  }
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  icon?: string | null;
  areaRoles: RoleTemplateAssignment[];
}

export async function createTemplate(
  adminToken: string,
  input: CreateTemplateInput,
): Promise<RoleTemplate> {
  const name = input.name.trim();
  if (!name) throw new Error("Nazwa wymagana");
  const templates = await listTemplates(adminToken);
  const baseSlug = slugify(name) || "template";
  let id = baseSlug;
  let n = 1;
  while (templates.some((t) => t.id === id)) {
    n += 1;
    id = `${baseSlug}-${n}`;
  }
  const now = new Date().toISOString();
  const tpl: RoleTemplate = {
    id,
    name,
    description: input.description?.trim() ?? "",
    icon: input.icon ?? null,
    areaRoles: sanitizeAssignments(input.areaRoles),
    createdAt: now,
    updatedAt: now,
  };
  await saveTemplates(adminToken, [...templates, tpl]);
  return tpl;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  icon?: string | null;
  areaRoles?: RoleTemplateAssignment[];
}

export async function updateTemplate(
  adminToken: string,
  id: string,
  patch: UpdateTemplateInput,
): Promise<RoleTemplate> {
  const templates = await listTemplates(adminToken);
  const idx = templates.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error("Template nie istnieje");
  const prev = templates[idx];
  const next: RoleTemplate = {
    ...prev,
    name: patch.name?.trim() ?? prev.name,
    description: patch.description?.trim() ?? prev.description,
    icon: patch.icon === undefined ? prev.icon : patch.icon,
    areaRoles:
      patch.areaRoles === undefined
        ? prev.areaRoles
        : sanitizeAssignments(patch.areaRoles),
    updatedAt: new Date().toISOString(),
  };
  templates[idx] = next;
  await saveTemplates(adminToken, templates);
  return next;
}

export async function deleteTemplate(
  adminToken: string,
  id: string,
): Promise<void> {
  const templates = await listTemplates(adminToken);
  const filtered = templates.filter((t) => t.id !== id);
  if (filtered.length === templates.length) return;
  await saveTemplates(adminToken, filtered);
}

export async function getTemplate(
  adminToken: string,
  id: string,
): Promise<RoleTemplate | null> {
  const templates = await listTemplates(adminToken);
  return templates.find((t) => t.id === id) ?? null;
}
