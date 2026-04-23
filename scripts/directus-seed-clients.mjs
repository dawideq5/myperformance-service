#!/usr/bin/env node
/**
 * Idempotent seeder for Directus `clients` collection.
 *
 * Creates the collection with the required fields, then upserts one row per
 * service in the MyPerformance stack. Each row records metadata about the
 * service: its Keycloak client, required roles, FQDN, SSO status and icon.
 *
 * Safe to re-run. Existing rows are matched by `slug` and updated.
 *
 * Usage:
 *   DIRECTUS_URL=https://cms.myperformance.pl \
 *   DIRECTUS_TOKEN=... \
 *     node scripts/directus-seed-clients.mjs
 */

const DIRECTUS_URL = requireEnv("DIRECTUS_URL");
const DIRECTUS_TOKEN = requireEnv("DIRECTUS_TOKEN");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[directus-seed] Missing required env ${name}`);
    process.exit(2);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Collection schema
// ---------------------------------------------------------------------------
const COLLECTION = {
  collection: "clients",
  meta: {
    collection: "clients",
    icon: "apps",
    note: "Katalog usług SSO/RBAC MyPerformance (panele, usługi, administracja).",
    display_template: "{{ name }} ({{ category }})",
    sort_field: "sort",
    archive_field: null,
    archive_value: null,
    unarchive_value: null,
    singleton: false,
    accountability: "all",
  },
  schema: { name: "clients" },
  fields: [
    { field: "id", type: "uuid",
      meta: { interface: "input", readonly: true, hidden: true, special: ["uuid"] },
      schema: { is_primary_key: true, length: 36, has_auto_increment: false } },
    { field: "sort", type: "integer",
      meta: { interface: "input", hidden: true },
      schema: {} },
    { field: "name", type: "string",
      meta: { interface: "input", required: true, width: "half" },
      schema: { is_nullable: false, max_length: 128 } },
    { field: "slug", type: "string",
      meta: { interface: "input", required: true, width: "half",
              note: "Unikalny identyfikator (kebab-case)" },
      schema: { is_unique: true, is_nullable: false, max_length: 64 } },
    { field: "category", type: "string",
      meta: { interface: "select-dropdown", width: "half",
              options: { choices: [
                { text: "Panel (cert-gated)", value: "panel" },
                { text: "Usługa aplikacyjna", value: "service" },
                { text: "Administracja",       value: "admin" },
                { text: "Integracja",          value: "integration" },
              ] } },
      schema: { default_value: "service", max_length: 32 } },
    { field: "fqdn", type: "string",
      meta: { interface: "input", width: "half",
              note: "Pełny URL publiczny (https://…)" },
      schema: { max_length: 255 } },
    { field: "description", type: "text",
      meta: { interface: "input-multiline", width: "full" },
      schema: {} },
    { field: "icon", type: "string",
      meta: { interface: "input", width: "half",
              note: "Nazwa ikony lucide-react (np. Calendar)" },
      schema: { max_length: 64 } },
    { field: "keycloak_client_id", type: "string",
      meta: { interface: "input", width: "half",
              note: "clientId w realmie MyPerformance" },
      schema: { max_length: 128 } },
    { field: "sso_enabled", type: "boolean",
      meta: { interface: "boolean", width: "half" },
      schema: { default_value: false } },
    { field: "visible", type: "boolean",
      meta: { interface: "boolean", width: "half",
              note: "Widoczny w dashboardzie" },
      schema: { default_value: true } },
    { field: "required_roles", type: "csv",
      meta: { interface: "tags", width: "full", special: ["cast-csv"],
              note: "Role realmowe Keycloak — użytkownik musi mieć co najmniej jedną" },
      schema: {} },
  ],
};

// ---------------------------------------------------------------------------
// Seed data — 15 services from the enterprise spec
// ---------------------------------------------------------------------------
const CLIENTS = [
  { sort:  1, name: "Kalendarz",             slug: "kalendarz",            category: "service",     fqdn: "https://myperformance.pl/dashboard/calendar",  icon: "Calendar",     keycloak_client_id: "mp-calendar",     sso_enabled: false, required_roles: []                             },
  { sort:  2, name: "Directus CMS",          slug: "directus",             category: "admin",       fqdn: "https://cms.myperformance.pl",                 icon: "Database",     keycloak_client_id: "directus",         sso_enabled: true,  required_roles: ["directus_admin"]             },
  { sort:  3, name: "Certyfikaty klienckie", slug: "certyfikaty-klienckie", category: "admin",      fqdn: "https://myperformance.pl/admin/certificates", icon: "ShieldCheck",  keycloak_client_id: "mp-certificates", sso_enabled: false, required_roles: ["certificates_admin"]         },
  { sort:  4, name: "Panel sprzedawcy",      slug: "panel-sprzedawcy",     category: "panel",       fqdn: "https://panelsprzedawcy.myperformance.pl",    icon: "ShoppingCart", keycloak_client_id: "panel-sprzedawca",  sso_enabled: true,  required_roles: ["sprzedawca"] },
  { sort:  5, name: "Panel serwisanta",      slug: "panel-serwisanta",     category: "panel",       fqdn: "https://panelserwisanta.myperformance.pl",    icon: "Wrench",       keycloak_client_id: "panel-serwisant",   sso_enabled: true,  required_roles: ["serwisant"]   },
  { sort:  6, name: "Panel kierowcy",        slug: "panel-kierowcy",       category: "panel",       fqdn: "https://panelkierowcy.myperformance.pl",      icon: "Truck",        keycloak_client_id: "panel-kierowca",    sso_enabled: true,  required_roles: ["kierowca"]     },
  { sort:  7, name: "Documenso — użytkownik", slug: "documenso-user",      category: "service",     fqdn: "https://sign.myperformance.pl",               icon: "FileSignature", keycloak_client_id: "documenso",       sso_enabled: true,  required_roles: ["documenso_user"]             },
  { sort:  8, name: "Documenso — administracja", slug: "documenso-admin",  category: "admin",       fqdn: "https://sign.myperformance.pl/admin",         icon: "FileSignature", keycloak_client_id: "documenso",       sso_enabled: true,  required_roles: ["documenso_admin"]            },
  { sort:  9, name: "Chatwoot — agent",      slug: "chatwoot-agent",       category: "service",     fqdn: "https://chat.myperformance.pl",               icon: "MessageSquare", keycloak_client_id: "chatwoot",        sso_enabled: true,  required_roles: ["chatwoot_agent"]             },
  { sort: 10, name: "Chatwoot — administracja", slug: "chatwoot-admin",    category: "admin",       fqdn: "https://chat.myperformance.pl",               icon: "MessageSquare", keycloak_client_id: "chatwoot",        sso_enabled: true,  required_roles: ["chatwoot_administrator"]             },
  { sort: 11, name: "Postal",                slug: "postal",               category: "admin",       fqdn: "https://postal.myperformance.pl",             icon: "Mail",         keycloak_client_id: "postal",           sso_enabled: true,  required_roles: ["postal_admin"]               },
  { sort: 12, name: "Kadromierz",            slug: "kadromierz",           category: "integration", fqdn: "https://app.kadromierz.pl",                   icon: "Clock",        keycloak_client_id: "mp-kadromierz",   sso_enabled: false, required_roles: ["kadromierz_user"]            },
  { sort: 13, name: "Keycloak",              slug: "keycloak",             category: "admin",       fqdn: "https://auth.myperformance.pl",               icon: "KeyRound",     keycloak_client_id: "mp-keycloak",     sso_enabled: true,  required_roles: ["keycloak_admin"]             },
  { sort: 14, name: "Step CA",               slug: "step-ca",              category: "admin",       fqdn: "https://myperformance.pl/dashboard/step-ca",  icon: "ShieldCheck",  keycloak_client_id: "stepca-oidc",     sso_enabled: true,  required_roles: ["stepca_admin"]               },
  { sort: 15, name: "Zarządzanie kontem",    slug: "zarzadzanie-kontem",   category: "service",     fqdn: "https://myperformance.pl/account",            icon: "UserCog",      keycloak_client_id: "mp-account",      sso_enabled: false, required_roles: []                             },
];

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function api(path, init = {}) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

// ---------------------------------------------------------------------------
// Collection ops
// ---------------------------------------------------------------------------
async function ensureCollection() {
  const existing = await api(`/collections/${COLLECTION.collection}`);
  if (existing.ok) {
    console.log(`[collection] ${COLLECTION.collection} exists — ensuring fields`);
    await ensureFields();
    return;
  }
  if (existing.status !== 403 && existing.status !== 404) {
    throw new Error(`probe failed: ${existing.status} ${JSON.stringify(existing.body)}`);
  }
  const create = await api("/collections", {
    method: "POST",
    body: JSON.stringify(COLLECTION),
  });
  if (!create.ok) {
    throw new Error(`create collection failed: ${create.status} ${JSON.stringify(create.body)}`);
  }
  console.log(`[collection] created ${COLLECTION.collection}`);
}

async function ensureFields() {
  const list = await api(`/fields/${COLLECTION.collection}`);
  if (!list.ok) {
    throw new Error(`fields list failed: ${list.status} ${JSON.stringify(list.body)}`);
  }
  const existingFieldNames = new Set(list.body.data.map((f) => f.field));
  for (const f of COLLECTION.fields) {
    if (existingFieldNames.has(f.field)) continue;
    const create = await api(`/fields/${COLLECTION.collection}`, {
      method: "POST",
      body: JSON.stringify(f),
    });
    if (!create.ok) {
      throw new Error(`create field ${f.field} failed: ${create.status} ${JSON.stringify(create.body)}`);
    }
    console.log(`[field] created ${f.field}`);
  }
}

// ---------------------------------------------------------------------------
// Row ops — upsert by slug
// ---------------------------------------------------------------------------
async function upsertClient(row) {
  const find = await api(`/items/clients?filter[slug][_eq]=${encodeURIComponent(row.slug)}&limit=1`);
  if (!find.ok) {
    throw new Error(`find ${row.slug}: ${find.status} ${JSON.stringify(find.body)}`);
  }
  const existing = find.body.data || [];
  if (existing.length > 0) {
    const id = existing[0].id;
    const upd = await api(`/items/clients/${id}`, {
      method: "PATCH",
      body: JSON.stringify(row),
    });
    if (!upd.ok) {
      throw new Error(`update ${row.slug}: ${upd.status} ${JSON.stringify(upd.body)}`);
    }
    console.log(`[client] updated ${row.slug}`);
    return;
  }
  const create = await api(`/items/clients`, {
    method: "POST",
    body: JSON.stringify(row),
  });
  if (!create.ok) {
    throw new Error(`create ${row.slug}: ${create.status} ${JSON.stringify(create.body)}`);
  }
  console.log(`[client] created ${row.slug}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`[directus-seed] url=${DIRECTUS_URL}`);
  await ensureCollection();
  for (const c of CLIENTS) {
    await upsertClient(c);
  }
  console.log(`[directus-seed] done — ${CLIENTS.length} entries`);
}

main().catch((err) => {
  console.error("[directus-seed] FAILED:", err);
  process.exit(1);
});
