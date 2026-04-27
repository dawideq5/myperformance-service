#!/usr/bin/env node
/**
 * Seed Directus public-role permission: read on `directus_files` filtered to
 * folder "locations". Bez tej permissions `/assets/{id}` zwraca 403 dla
 * anonimowych userów — zdjęcia punktów nie wyświetlają się w panelach.
 *
 * Idempotent: jeśli reguła istnieje (collection=directus_files +
 * roles=[publicRole] + action=read + filter na folderze) — nic nie robi.
 *
 * Wymaga: DIRECTUS_URL + DIRECTUS_ADMIN_TOKEN.
 */

const baseUrl = (process.env.DIRECTUS_URL || process.env.DIRECTUS_INTERNAL_URL || "").replace(/\/$/, "");
const token = process.env.DIRECTUS_ADMIN_TOKEN || process.env.DIRECTUS_TOKEN;
if (!baseUrl || !token) {
  console.error("Missing DIRECTUS_URL or DIRECTUS_ADMIN_TOKEN");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function findFolderId(name) {
  const r = await fetch(
    `${baseUrl}/folders?filter[name][_eq]=${encodeURIComponent(name)}&limit=1`,
    { headers },
  );
  if (!r.ok) throw new Error(`folders ${r.status}`);
  const data = await r.json();
  return data?.data?.[0]?.id ?? null;
}

async function findPublicRoleId() {
  // Directus 11+ — public role to specjalna pseudo-rola, nie ma rekordu w
  // `directus_roles`. W permissions używamy `roles: null` (public access).
  // Starsze wersje miały `directus_roles.public=true` — fallback na lookup.
  const r = await fetch(`${baseUrl}/roles?filter[name][_eq]=Public&limit=1`, { headers });
  if (r.ok) {
    const data = await r.json();
    if (data?.data?.[0]?.id) return data.data[0].id;
  }
  return null; // null = public/unauthenticated w Directus 11+
}

async function findExistingRule(folderId, publicRoleId) {
  const filter = encodeURIComponent(
    JSON.stringify({
      collection: { _eq: "directus_files" },
      action: { _eq: "read" },
      ...(publicRoleId
        ? { role: { _eq: publicRoleId } }
        : { role: { _null: true } }),
    }),
  );
  const r = await fetch(`${baseUrl}/permissions?filter=${filter}&limit=20`, { headers });
  if (!r.ok) return null;
  const data = await r.json();
  return (data?.data ?? []).find(
    (p) => JSON.stringify(p.permissions || {}).includes(folderId),
  );
}

async function createRule(folderId, publicRoleId) {
  const body = {
    collection: "directus_files",
    action: "read",
    role: publicRoleId, // null = public
    permissions: { folder: { _eq: folderId } },
    fields: ["id", "filename_disk", "filename_download", "type", "filesize", "width", "height", "title", "description", "folder"],
  };
  const r = await fetch(`${baseUrl}/permissions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`permissions POST ${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json();
}

(async () => {
  const folderId = await findFolderId("locations");
  if (!folderId) {
    console.error('Folder "locations" not found. Upload jednego zdjęcia stworzy folder.');
    process.exit(2);
  }
  const publicRoleId = await findPublicRoleId();
  console.log(`folder locations: ${folderId}`);
  console.log(`public role: ${publicRoleId ?? "<null = unauthenticated>"}`);

  const existing = await findExistingRule(folderId, publicRoleId);
  if (existing) {
    console.log(`Rule already exists: ${existing.id}. Nothing to do.`);
    return;
  }
  const created = await createRule(folderId, publicRoleId);
  console.log("Created public read rule:", created?.data?.id ?? "(ok)");
  console.log("Test: curl -I", `${baseUrl}/assets/<file-id>`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
